# ArtVault — AI Architecture

**Status: local FAQ assistant and heuristic customer recommendations implemented.**
No external language or vision model is connected to the assistant. The UI
labels this accurately. See [Assistant and recommendations](ASSISTANT_RECOMMENDATIONS.md)
for implementation, privacy, testing and coordinated deployment requirements.

## Provider-agnostic interface

```ts
interface AIProvider {
  analyzeArtwork(input: ArtworkAnalysisInput): Promise<ArtworkAnalysis>
  generateAssistantResponse(input: AssistantInput): Promise<AssistantReply>
  createStructuredSearchIntent(query: string): Promise<SearchIntent>
  rankAuctionCandidates(input: RankingInput): Promise<RankedCandidates>
}
```

The interface above is a conceptual separation of capabilities, not a claim
that all model operations are deployed. Module 06 already supplies a separate
artwork-analysis provider contract and deterministic auction selection. Its
ranking rules are independent of customer recommendations.

The assistant uses canonical, reviewed FAQ answers. Its optional server-only
provider contract classifies questions into an allowlisted topic. It cannot
generate account facts, execute tools or choose database operations. Without a
provider, bounded keyword matching selects the same reviewed answers.

## Non-negotiable rules for whichever provider is chosen

- The frontend never holds an AI API key and never calls the provider
  directly. Any future provider integration belongs in a trusted Supabase
  Edge Function/server boundary, with explicit timeout and usage controls.
- The assistant has no unrestricted database access. The current FAQ RPC
  only reads canonical answers and writes the caller's own conversation.
  It cannot read orders/addresses/payments or alter commerce/roles.
- Product facts the AI states to a user must come from that
  server-assembled ArtVault context, not model memory, to avoid
  hallucinated prices/availability.
- Authenticated FAQ exchanges are persisted privately and rate-limited per
  verified active user. Guest exchanges stay in memory. Credentials and raw
  provider errors must never be logged. No paid provider has been enabled.
