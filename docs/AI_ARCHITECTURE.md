# ArtVault — AI Architecture

**Status: interface defined, nothing implemented.** No AI provider is
selected, no key exists anywhere, and no Cloud Function gateway is deployed
in Module 00.

## Provider-agnostic interface

```ts
interface AIProvider {
  analyzeArtwork(input: ArtworkAnalysisInput): Promise<ArtworkAnalysis>
  generateAssistantResponse(input: AssistantInput): Promise<AssistantReply>
  createStructuredSearchIntent(query: string): Promise<SearchIntent>
  rankAuctionCandidates(input: RankingInput): Promise<RankedCandidates>
}
```

The concrete provider (Gemini, Claude, or another) is chosen **inside the
AI module**, at which point current pricing and availability are verified
rather than assumed. Whichever provider is picked is implemented behind
this interface.

## Non-negotiable rules for whichever provider is chosen

- The frontend never holds an AI API key and never calls the provider
  directly. A Cloud Function is the sole gateway.
- The AI never has unrestricted Firestore access. The gateway function
  assembles context itself, via curated, restricted read-only queries,
  and hands the model only that assembled context — the model does not
  query Firestore on its own behalf.
- Product facts the AI states to a user must come from that
  server-assembled ArtVault context, not model memory, to avoid
  hallucinated prices/availability.
- All AI interactions are logged (for audit and cost tracking) and
  rate-limited per user.
