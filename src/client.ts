import {
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  xdr,
  Account,
} from '@stellar/stellar-sdk';
import { CoralSwapConfig, NetworkConfig, NETWORK_CONFIGS, DEFAULTS } from './config';
import { Network, TxStatus, Result } from './types/common';
import { FactoryClient } from './contracts/factory';
import { PairClient } from './contracts/pair';
import { RouterClient } from './contracts/router';
import { LPTokenClient } from './contracts/lp-token';

/**
 * Main entry point for the CoralSwap SDK.
 *
 * Provides a unified interface to all CoralSwap protocol interactions,
 * connecting directly to Soroban RPC without intermediary APIs.
 */
export class CoralSwapClient {
  readonly network: Network;
  readonly config: CoralSwapConfig;
  readonly networkConfig: NetworkConfig;
  readonly server: SorobanRpc.Server;

  private keypair: Keypair | null = null;
  private _factory: FactoryClient | null = null;
  private _router: RouterClient | null = null;

  constructor(config: CoralSwapConfig) {
    this.config = {
      defaultSlippageBps: DEFAULTS.slippageBps,
      defaultDeadlineSec: DEFAULTS.deadlineSec,
      maxRetries: DEFAULTS.maxRetries,
      retryDelayMs: DEFAULTS.retryDelayMs,
      ...config,
    };

    this.network = config.network;
    this.networkConfig = {
      ...NETWORK_CONFIGS[config.network],
      ...(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {}),
    };

    this.server = new SorobanRpc.Server(this.networkConfig.rpcUrl);

    if (config.secretKey) {
      this.keypair = Keypair.fromSecret(config.secretKey);
    }
  }

  /**
   * Get the public key of the configured signer.
   */
  get publicKey(): string {
    if (this.config.publicKey) return this.config.publicKey;
    if (this.keypair) return this.keypair.publicKey();
    throw new Error('No signing key configured');
  }

  /**
   * Access the Factory contract client (singleton).
   */
  get factory(): FactoryClient {
    if (!this._factory) {
      if (!this.networkConfig.factoryAddress) {
        throw new Error('Factory address not configured for this network');
      }
      this._factory = new FactoryClient(
        this.networkConfig.factoryAddress,
        this.networkConfig.rpcUrl,
        this.networkConfig.networkPassphrase,
      );
    }
    return this._factory;
  }

  /**
   * Access the Router contract client (singleton).
   */
  get router(): RouterClient {
    if (!this._router) {
      if (!this.networkConfig.routerAddress) {
        throw new Error('Router address not configured for this network');
      }
      this._router = new RouterClient(
        this.networkConfig.routerAddress,
        this.networkConfig.rpcUrl,
        this.networkConfig.networkPassphrase,
      );
    }
    return this._router;
  }

  /**
   * Create a PairClient for a specific pair contract address.
   */
  pair(pairAddress: string): PairClient {
    return new PairClient(
      pairAddress,
      this.networkConfig.rpcUrl,
      this.networkConfig.networkPassphrase,
    );
  }

  /**
   * Create an LPTokenClient for a specific LP token contract.
   */
  lpToken(lpTokenAddress: string): LPTokenClient {
    return new LPTokenClient(
      lpTokenAddress,
      this.networkConfig.rpcUrl,
      this.networkConfig.networkPassphrase,
    );
  }

  /**
   * Lookup the pair address for a token pair via the factory.
   */
  async getPairAddress(tokenA: string, tokenB: string): Promise<string | null> {
    return this.factory.getPair(tokenA, tokenB);
  }

  /**
   * Build, simulate, sign and submit a transaction.
   */
  async submitTransaction(
    operations: xdr.Operation[],
    source?: string,
  ): Promise<Result<{ txHash: string; ledger: number }>> {
    try {
      const sourceKey = source ?? this.publicKey;
      const account = await this.server.getAccount(sourceKey);

      let builder = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: this.networkConfig.networkPassphrase,
      });

      for (const op of operations) {
        builder = builder.addOperation(op);
      }

      const tx = builder.setTimeout(this.networkConfig.sorobanTimeout).build();

      const sim = await this.server.simulateTransaction(tx);
      if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
        return {
          success: false,
          error: {
            code: 'SIMULATION_FAILED',
            message: 'Transaction simulation failed',
            details: { simulation: sim },
          },
        };
      }

      const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();

      if (this.keypair) {
        preparedTx.sign(this.keypair);
      } else {
        return {
          success: false,
          error: {
            code: 'NO_SIGNER',
            message: 'No signing key configured. Use signAndSubmit with an external signer.',
          },
        };
      }

      const response = await this.server.sendTransaction(preparedTx);

      if (response.status === 'ERROR') {
        return {
          success: false,
          error: {
            code: 'SUBMIT_FAILED',
            message: 'Transaction submission failed',
            details: { response },
          },
        };
      }

      const result = await this.pollTransaction(response.hash);
      return result;
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          details: { error: err },
        },
      };
    }
  }

  /**
   * Poll for transaction completion with configurable retries.
   */
  private async pollTransaction(
    txHash: string,
  ): Promise<Result<{ txHash: string; ledger: number }>> {
    const maxRetries = this.config.maxRetries ?? DEFAULTS.maxRetries;
    const retryDelay = this.config.retryDelayMs ?? DEFAULTS.retryDelayMs;

    for (let attempt = 0; attempt < maxRetries * 10; attempt++) {
      const status = await this.server.getTransaction(txHash);

      if (status.status === 'SUCCESS') {
        return {
          success: true,
          data: {
            txHash,
            ledger: status.ledger ?? 0,
          },
          txHash,
        };
      }

      if (status.status === 'FAILED') {
        return {
          success: false,
          error: {
            code: 'TX_FAILED',
            message: 'Transaction failed on-chain',
            details: { status },
          },
          txHash,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    return {
      success: false,
      error: {
        code: 'TX_TIMEOUT',
        message: `Transaction polling timed out after ${maxRetries * 10} attempts`,
      },
      txHash,
    };
  }

  /**
   * Simulate a transaction without submitting (dry-run).
   */
  async simulateTransaction(
    operations: xdr.Operation[],
    source?: string,
  ): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    const sourceKey = source ?? this.publicKey;
    const account = await this.server.getAccount(sourceKey);

    let builder = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.networkConfig.networkPassphrase,
    });

    for (const op of operations) {
      builder = builder.addOperation(op);
    }

    const tx = builder.setTimeout(30).build();
    return this.server.simulateTransaction(tx);
  }

  /**
   * Calculate a deadline timestamp (current ledger time + offset seconds).
   */
  getDeadline(offsetSec?: number): number {
    const offset = offsetSec ?? this.config.defaultDeadlineSec ?? DEFAULTS.deadlineSec;
    return Math.floor(Date.now() / 1000) + offset;
  }

  /**
   * Health check -- verify RPC connection.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.server.getHealth();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Get the current ledger number from the RPC.
   */
  async getCurrentLedger(): Promise<number> {
    const info = await this.server.getLatestLedger();
    return info.sequence;
  }
}
