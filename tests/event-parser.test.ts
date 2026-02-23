import { xdr, Address, nativeToScVal } from '@stellar/stellar-sdk';
import { EventParser, RawSorobanEvent, EVENT_TOPICS } from '../src/utils/events';
import { ValidationError } from '../src/errors';

// ---------------------------------------------------------------------------
// Helpers to build mock ScVal structures
// ---------------------------------------------------------------------------

function symbolVal(s: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(s);
}

function addressVal(addr: string): xdr.ScVal {
  return nativeToScVal(Address.fromString(addr), { type: 'address' });
}

function i128Val(n: bigint): xdr.ScVal {
  return nativeToScVal(n, { type: 'i128' });
}

function u32Val(n: number): xdr.ScVal {
  return xdr.ScVal.scvU32(n);
}

function scMap(entries: [string, xdr.ScVal][]): xdr.ScVal {
  const mapEntries = entries.map(([key, val]) =>
    new xdr.ScMapEntry({ key: symbolVal(key), val }),
  );
  return xdr.ScVal.scvMap(mapEntries);
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ADDR_SENDER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const ADDR_TOKEN_A = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const ADDR_TOKEN_B = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';
const CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

function makeRaw(topic: string, value: xdr.ScVal): RawSorobanEvent {
  return {
    type: 'contract',
    ledger: 12345,
    contractId: CONTRACT_ID,
    id: '001',
    pagingToken: 'abc',
    topic: [symbolVal(topic)],
    value,
    inSuccessfulContractCall: true,
    txHash: 'tx_abc123',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventParser', () => {
  let parser: EventParser;

  beforeEach(() => {
    parser = new EventParser();
  });

  // -----------------------------------------------------------------------
  // Swap events
  // -----------------------------------------------------------------------

  describe('swap events', () => {
    const swapValue = scMap([
      ['sender', addressVal(ADDR_SENDER)],
      ['token_in', addressVal(ADDR_TOKEN_A)],
      ['token_out', addressVal(ADDR_TOKEN_B)],
      ['amount_in', i128Val(1000000n)],
      ['amount_out', i128Val(980000n)],
      ['fee_bps', u32Val(30)],
    ]);

    it('parses a valid swap event', () => {
      const raw = makeRaw(EVENT_TOPICS.SWAP, swapValue);
      const result = parser.parseSingle(raw);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('swap');

      const swap = result as import('../src/types/events').SwapEvent;
      expect(swap.sender).toBe(ADDR_SENDER);
      expect(swap.amountIn).toBe(1000000n);
      expect(swap.amountOut).toBe(980000n);
      expect(swap.feeBps).toBe(30);
      expect(swap.txHash).toBe('tx_abc123');
      expect(swap.ledger).toBe(12345);
    });
  });

  // -----------------------------------------------------------------------
  // Liquidity events
  // -----------------------------------------------------------------------

  describe('liquidity events', () => {
    const liquidityValue = scMap([
      ['provider', addressVal(ADDR_SENDER)],
      ['token_a', addressVal(ADDR_TOKEN_A)],
      ['token_b', addressVal(ADDR_TOKEN_B)],
      ['amount_a', i128Val(500000n)],
      ['amount_b', i128Val(600000n)],
      ['liquidity', i128Val(547722n)],
    ]);

    it('parses an add_liquidity event', () => {
      const raw = makeRaw(EVENT_TOPICS.ADD_LIQUIDITY, liquidityValue);
      const result = parser.parseSingle(raw);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('add_liquidity');

      const liq = result as import('../src/types/events').LiquidityEvent;
      expect(liq.provider).toBe(ADDR_SENDER);
      expect(liq.amountA).toBe(500000n);
      expect(liq.amountB).toBe(600000n);
      expect(liq.liquidity).toBe(547722n);
    });

    it('parses a remove_liquidity event', () => {
      const raw = makeRaw(EVENT_TOPICS.REMOVE_LIQUIDITY, liquidityValue);
      const result = parser.parseSingle(raw);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('remove_liquidity');
    });
  });

  // -----------------------------------------------------------------------
  // Flash loan events
  // -----------------------------------------------------------------------

  describe('flash loan events', () => {
    const flashValue = scMap([
      ['borrower', addressVal(ADDR_SENDER)],
      ['token', addressVal(ADDR_TOKEN_A)],
      ['amount', i128Val(2000000n)],
      ['fee', i128Val(600n)],
    ]);

    it('parses a flash_loan event', () => {
      const raw = makeRaw(EVENT_TOPICS.FLASH_LOAN, flashValue);
      const result = parser.parseSingle(raw);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('flash_loan');

      const fl = result as import('../src/types/events').FlashLoanEvent;
      expect(fl.borrower).toBe(ADDR_SENDER);
      expect(fl.amount).toBe(2000000n);
      expect(fl.fee).toBe(600n);
    });
  });

  // -----------------------------------------------------------------------
  // Fee update events
  // -----------------------------------------------------------------------

  describe('fee update events', () => {
    const feeValue = scMap([
      ['previous_fee_bps', u32Val(30)],
      ['new_fee_bps', u32Val(45)],
      ['volatility', i128Val(150000n)],
    ]);

    it('parses a fee_update event', () => {
      const raw = makeRaw(EVENT_TOPICS.FEE_UPDATE, feeValue);
      const result = parser.parseSingle(raw);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('fee_update');

      const fee = result as import('../src/types/events').FeeUpdateEvent;
      expect(fee.previousFeeBps).toBe(30);
      expect(fee.newFeeBps).toBe(45);
      expect(fee.volatility).toBe(150000n);
    });
  });

  // -----------------------------------------------------------------------
  // Proposal events
  // -----------------------------------------------------------------------

  describe('proposal events', () => {
    const proposalValue = scMap([
      ['action_hash', symbolVal('hash_abc')],
      ['signer', addressVal(ADDR_SENDER)],
      ['signatures_count', u32Val(2)],
    ]);

    it('parses a proposal_signed event', () => {
      const raw = makeRaw(EVENT_TOPICS.PROPOSAL_SIGNED, proposalValue);
      const result = parser.parseSingle(raw);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('proposal_signed');

      const prop = result as import('../src/types/events').ProposalEvent;
      expect(prop.actionHash).toBe('hash_abc');
      expect(prop.signaturesCount).toBe(2);
    });

    it('parses a proposal_executed event', () => {
      const raw = makeRaw(EVENT_TOPICS.PROPOSAL_EXECUTED, proposalValue);
      const result = parser.parseSingle(raw);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('proposal_executed');
    });
  });

  // -----------------------------------------------------------------------
  // Batch parsing
  // -----------------------------------------------------------------------

  describe('parse (lenient)', () => {
    it('handles multiple events and skips unknown topics', () => {
      const swapValue = scMap([
        ['sender', addressVal(ADDR_SENDER)],
        ['token_in', addressVal(ADDR_TOKEN_A)],
        ['token_out', addressVal(ADDR_TOKEN_B)],
        ['amount_in', i128Val(100n)],
        ['amount_out', i128Val(90n)],
        ['fee_bps', u32Val(30)],
      ]);

      const events: RawSorobanEvent[] = [
        makeRaw('swap', swapValue),
        makeRaw('unknown_event', xdr.ScVal.scvVoid()),
        makeRaw('swap', swapValue),
      ];

      const result = parser.parse(events);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('swap');
      expect(result[1].type).toBe('swap');
    });

    it('returns empty array for empty input', () => {
      expect(parser.parse([])).toHaveLength(0);
    });

    it('skips events with malformed XDR data', () => {
      const bad: RawSorobanEvent = {
        ...makeRaw('swap', xdr.ScVal.scvVoid()),
      };
      const result = parser.parse([bad]);
      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Strict parsing
  // -----------------------------------------------------------------------

  describe('parseStrict', () => {
    it('throws on unknown event topics', () => {
      const events = [makeRaw('unknown_event', xdr.ScVal.scvVoid())];
      expect(() => parser.parseStrict(events)).toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns null for events with no topics', () => {
      const raw: RawSorobanEvent = {
        type: 'contract',
        ledger: 1,
        contractId: CONTRACT_ID,
        id: '999',
        pagingToken: 'xyz',
        topic: [],
        value: xdr.ScVal.scvVoid(),
        inSuccessfulContractCall: true,
        txHash: 'tx_000',
      };
      expect(parser.parseSingle(raw)).toBeNull();
    });
  });
});
