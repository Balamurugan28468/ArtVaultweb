begin;

-- Auction bidding stays deferred. This read-only RPC exposes only public
-- catalog facts and aggregate bid state; individual bidders remain private.
create function public.get_public_auctions()
returns table(
  id uuid,
  artwork_id uuid,
  seller_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  starting_bid_minor bigint,
  bid_increment_minor bigint,
  current_high_bid bigint,
  bid_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.id, i.artwork_id, i.seller_id, a.starts_at, a.ends_at,
    i.starting_bid_minor, i.bid_increment_minor,
    max(b.amount_minor) as current_high_bid, count(b.id) as bid_count,
    a.created_at, a.updated_at
  from public.auctions a
  join public.auction_items i on i.auction_id = a.id
  left join public.bids b on b.auction_item_id = i.id
  where a.status in ('SCHEDULED','LIVE','ENDED','FINALIZED')
  group by a.id,i.artwork_id,i.seller_id,a.starts_at,a.ends_at,i.starting_bid_minor,i.bid_increment_minor,a.created_at,a.updated_at
  order by a.starts_at asc, a.id asc
  limit 200;
$$;
revoke all on function public.get_public_auctions() from public, anon, authenticated;
grant execute on function public.get_public_auctions() to anon, authenticated;
commit;
