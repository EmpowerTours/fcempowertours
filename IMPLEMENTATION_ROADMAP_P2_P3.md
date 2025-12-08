# PRIORITY 2 & 3: Artist Booking + Savings Goals

## Priority 2: Artist Booking Marketplace (4-5 weeks)

**Dependencies:** MusicBeatMatch (for popularity metrics)
**Status:** Build after Experiences are live

### Phase 1: Contract (Week 1-2)

The ArtistBooking contract from STRATEGIC_VISION.md is ready to deploy. Key features:
- Artists register with performance fees
- Venues request bookings
- Events created when accepted
- Ticket sales with escrow
- Revenue split: 70% artist, 25% venue, 5% platform

### Phase 2: Frontend (Week 3-4)

**Three Main Views:**

1. **Artist Dashboard:**
   - Performance history
   - Popularity metrics from MusicBeatMatch
   - Booking requests
   - Earnings tracker

2. **Venue Dashboard:**
   - Browse trending artists
   - Request bookings
   - Event management
   - Ticket sales tracking

3. **Fan View:**
   - Discover events
   - Buy tickets
   - View purchased tickets (NFTs)

### Phase 3: Testing & Launch (Week 5)

Test scenarios:
- Artist registers → Venue books → Event created
- Fans buy tickets → Event completes → Revenue splits
- Integration with MusicBeatMatch popularity data

---

## Priority 3: Savings Goals (2-3 weeks)

**Dependencies:** None (standalone feature)
**Status:** Simple implementation, high impact

### Phase 1: Contract (Week 1)

The TravelSavings contract from STRATEGIC_VISION.md includes:
- Goal creation (target amount)
- Auto-save percentage from rewards
- Staking for yield
- Manual deposits
- Progress tracking

### Phase 2: Frontend (Week 2)

**Simple UX:**
1. Create goal: "Save 1000 MON for Ghana Trip"
2. Set auto-save: 10% of game rewards
3. Track progress with visual progress bar
4. One-click withdraw when ready

### Phase 3: Auto-Save Integration (Week 3)

Connect to game contracts:
- When user wins MusicBeatMatch → auto-deposit 10% to savings
- When user completes CountryCollector → auto-deposit percentage
- User sees: "Earned 10 MON, saved 1 MON toward Ghana Trip!"

---

## Priority 4: Group Travel (Build Last)

**Why last?** Most complex feature, requires:
- Smart contract escrow (no shared keys!)
- Multi-party coordination
- Spending limits and safety rails
- Dispute resolution

**Timeline:** 4-5 weeks
**Build after:** Experiences + Artist Booking + Savings are stable

Full implementation details in GROUP_TRAVEL_SECURITY.md

---

## Development Timeline Summary

```
Month 1-2: Experience + GPS + Transport (PRIORITY 1)
Month 2-3: Artist Booking (PRIORITY 2)
Month 3: Savings Goals (PRIORITY 3)
Month 4: Group Travel (PRIORITY 4)
Month 4+: Polish, marketing, scale
```

**Rationale:**
1. Experiences are the CORE value prop → Build first
2. Artist bookings leverage existing music economy → Natural second
3. Savings goals are simple + high engagement → Quick win
4. Group travel is complex → Build last with learnings from others

---

**Last Updated:** December 2025
**Status:** Phased Implementation Plan
