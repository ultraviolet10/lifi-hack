// Probe: find USDC vaults on Base where LI.FI Composer can actually produce
// a deposit tx for our FIXED_AMOUNT (0.2 USDC). Reports PASS/FAIL per vault
// with approvalAddress + estimated tx when successful, or the upstream error.
//
// Usage:
//   TEST_WALLET_ADDRESS=0x... LIFI_API_KEY=... bun run index.ts
//   Optional: FROM_AMOUNT=200000  (raw units, default 200000 = 0.2 USDC)
//             LIMIT=15            (vaults to try)
//             CHAIN_ID=8453       (Base)
//             ASSET=USDC

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const EARN_API = "https://earn.li.fi";
const LIFI_API = "https://li.quest";

interface Vault {
  slug: string;
  name: string;
  address: string;
  chainId: number;
  isTransactional: boolean;
  protocol: { name: string };
  analytics: { apy: { total: number }; tvl: { usd: string } };
}

interface QuoteOk {
  id: string;
  tool: string;
  estimate: {
    approvalAddress: string;
    toAmount: string;
    toAmountMin: string;
    fromAmountUSD?: string;
    toAmountUSD?: string;
  };
  transactionRequest: { to: string; data: string; value?: string };
}

function must(k: string): string {
  const v = process.env[k];
  if (!v) {
    console.error(`FAIL missing env: ${k}`);
    process.exit(1);
  }
  return v;
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const usd = (s: string) => `$${Math.round(Number(s)).toLocaleString()}`;

async function main() {
  const wallet = must("TEST_WALLET_ADDRESS");
  const apiKey = process.env.LIFI_API_KEY;
  const fromAmount = process.env.FROM_AMOUNT ?? "200000";
  const limit = Number(process.env.LIMIT ?? "15");
  const chainId = Number(process.env.CHAIN_ID ?? "8453");
  const asset = process.env.ASSET ?? "USDC";

  console.log(`\n→ Discovering ${asset} vaults on chain ${chainId} (limit ${limit})`);
  const params = new URLSearchParams({
    chainId: String(chainId),
    asset,
    sortBy: "apy",
    minTvlUsd: "100000",
    limit: String(limit),
  });
  const disco = await fetch(`${EARN_API}/v1/earn/vaults?${params}`);
  if (!disco.ok) {
    console.error(`FAIL earn discovery ${disco.status}: ${await disco.text()}`);
    process.exit(1);
  }
  const { data } = (await disco.json()) as { data: Vault[] };

  const depositable = data.filter((v) => v.isTransactional);
  console.log(
    `  ${data.length} returned, ${depositable.length} marked isTransactional, ${
      data.length - depositable.length
    } filtered\n`,
  );

  const headers: Record<string, string> = {};
  if (apiKey) headers["x-lifi-api-key"] = apiKey;

  const results: Array<{
    slug: string;
    protocol: string;
    apy: string;
    tvl: string;
    ok: boolean;
    note: string;
  }> = [];

  for (const v of depositable) {
    const qp = new URLSearchParams({
      fromChain: String(chainId),
      toChain: String(v.chainId),
      fromToken: USDC_BASE,
      toToken: v.address,
      fromAddress: wallet,
      toAddress: wallet,
      fromAmount,
      slippage: "0.005",
      order: "CHEAPEST",
      maxPriceImpact: "0.25",
      integrator: "earnie-probe",
    });

    const res = await fetch(`${LIFI_API}/v1/quote?${qp}`, { headers });
    const text = await res.text();

    if (res.ok) {
      const q = JSON.parse(text) as QuoteOk;
      const note = `tool=${q.tool} approvalAddr=${q.estimate.approvalAddress.slice(0, 10)}… out=${q.estimate.toAmountUSD ?? "?"}`;
      console.log(
        `  \x1b[32mPASS\x1b[0m  ${v.protocol.name.padEnd(16)} ${pct(v.analytics.apy.total).padStart(8)}  ${usd(v.analytics.tvl.usd).padStart(10)}  ${v.slug}`,
      );
      console.log(`         ${note}`);
      results.push({
        slug: v.slug,
        protocol: v.protocol.name,
        apy: pct(v.analytics.apy.total),
        tvl: usd(v.analytics.tvl.usd),
        ok: true,
        note,
      });
    } else {
      let code = "";
      let msg = text.slice(0, 200);
      try {
        const j = JSON.parse(text) as { code?: number; message?: string };
        code = j.code ? `code=${j.code} ` : "";
        msg = j.message ?? msg;
      } catch {
        // non-json error body
      }
      console.log(
        `  \x1b[31mFAIL\x1b[0m  ${v.protocol.name.padEnd(16)} ${pct(v.analytics.apy.total).padStart(8)}  ${usd(v.analytics.tvl.usd).padStart(10)}  ${v.slug}`,
      );
      console.log(`         ${res.status} ${code}${msg}`);
      results.push({
        slug: v.slug,
        protocol: v.protocol.name,
        apy: pct(v.analytics.apy.total),
        tvl: usd(v.analytics.tvl.usd),
        ok: false,
        note: `${res.status} ${code}${msg}`,
      });
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const pass = results.filter((r) => r.ok);
  console.log(`\n─ Summary ─`);
  console.log(`  ${pass.length}/${results.length} quotable at ${fromAmount} raw units`);
  if (pass.length === 0) {
    console.log(`  try FROM_AMOUNT=1000000 (1 USDC) or 10000000 (10 USDC)`);
  } else {
    console.log(`\n  Use one of these for your demo:`);
    for (const r of pass)
      console.log(`    - ${r.slug}  (${r.protocol}, ${r.apy} APY, ${r.tvl} TVL)`);
  }
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.stack : e);
  process.exit(1);
});
