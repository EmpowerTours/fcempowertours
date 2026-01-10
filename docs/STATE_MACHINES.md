# EmpowerTours Component State Machines

This document contains state machine diagrams for all major components in the EmpowerTours application.

---

## 1. DailyAccessGate

Multi-requirement onboarding gate with 5 daily access checks.

```mermaid
stateDiagram-v2
    [*] --> Loading: Component Mount
    Loading --> CheckingRequirements: Fetch User Data

    CheckingRequirements --> RequirementsView: Data Loaded

    state RequirementsView {
        [*] --> Idle

        state "Faucet Action" as Faucet {
            Idle --> ClaimingFaucet: Click Claim
            ClaimingFaucet --> FaucetSuccess: TX Success
            ClaimingFaucet --> FaucetError: TX Failed
            FaucetSuccess --> Idle: Reset
            FaucetError --> Idle: Dismiss
        }

        state "Subscription Action" as Sub {
            Idle --> Subscribing: Click Subscribe
            Subscribing --> SubSuccess: TX Success
            Subscribing --> SubError: TX Failed
            SubSuccess --> Idle: Reset
            SubError --> Idle: Dismiss
            Idle --> Skipped: Click Skip
        }

        state "Follow Action" as Follow {
            Idle --> CheckingFollow: Click Verify
            CheckingFollow --> FollowSuccess: Already Following
            CheckingFollow --> FollowPrompt: Not Following
            FollowPrompt --> Following: Open Warpcast
            Following --> FollowSuccess: Confirmed
        }

        state "Passport Action" as Passport {
            Idle --> MintingPassport: Click Mint
            MintingPassport --> PassportSuccess: TX Success
            MintingPassport --> PassportError: TX Failed
        }

        state "Lottery Action" as Lottery {
            Idle --> EnteringLottery: Click Enter
            EnteringLottery --> LotterySuccess: TX Success
            EnteringLottery --> LotteryError: TX Failed
            LotterySuccess --> WaitingDraw: Countdown
        }
    }

    RequirementsView --> AllComplete: All 5 Requirements Met
    AllComplete --> [*]: onAccessGranted()
```

**States:**
- `Loading` - Initial data fetch
- `Idle` - Ready for user action
- `activeAction` states: `'faucet'`, `'subscription'`, `'follow'`, `'passport'`, `'lottery'`
- `Success/Error` - Per-action feedback

---

## 2. MirrorMate (Tour Guide Matching)

Tinder-style guide matching with hold-to-match gesture.

```mermaid
stateDiagram-v2
    [*] --> Loading: Component Mount
    Loading --> FetchingGuides: Get Guides from Envio
    FetchingGuides --> NoGuides: Empty Result
    FetchingGuides --> BrowsingGuides: Guides Found

    state BrowsingGuides {
        [*] --> ViewingGuide

        ViewingGuide --> Skipping: Tap Skip Button
        Skipping --> SkipSuccess: TX Success
        Skipping --> SkipError: TX Failed
        SkipSuccess --> ViewingGuide: Next Guide
        SkipError --> ViewingGuide: Show Error

        ViewingGuide --> HoldingMatch: Touch Start on Match
        HoldingMatch --> ViewingGuide: Touch End (< 600ms)
        HoldingMatch --> Matching: Hold Complete (600ms)
        Matching --> MatchSuccess: TX Success
        Matching --> MatchError: TX Failed
        MatchSuccess --> OpenDM: Open Warpcast DM
        OpenDM --> ViewingGuide: Next Guide
        MatchError --> ViewingGuide: Show Error

        ViewingGuide --> Finished: No More Guides
    }

    NoGuides --> ShowRegisterPrompt: Not Registered
    NoGuides --> ShowEmptyState: Is Registered

    state Registration {
        [*] --> FormIdle
        FormIdle --> FormOpen: Click Register/Edit
        FormOpen --> Submitting: Submit Form
        Submitting --> RegSuccess: TX Success
        Submitting --> RegError: TX Failed
        RegSuccess --> FormIdle: Close Modal
        RegError --> FormOpen: Show Error
    }

    Finished --> [*]
```

**Transaction States (`txState`):**
- `'idle'` - Ready for action
- `'loading'` - Transaction in progress
- `'success'` - Transaction confirmed
- `'error'` - Transaction failed

**Gesture States:**
- `isHolding: boolean` - Touch/mouse down on match button
- `holdProgress: 0-100` - Visual progress ring fill

---

## 3. CreateNFTModal (Music/Art NFT Minting)

4-step NFT creation wizard with file upload and audio trimming.

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Step1_ChooseType: Open Modal

    state "Step 1: Choose Type" as Step1_ChooseType {
        [*] --> TypeSelection
        TypeSelection --> MusicSelected: Click Music
        TypeSelection --> ArtSelected: Click Art
    }

    Step1_ChooseType --> Step2_Upload: Type Selected

    state "Step 2: Upload Files" as Step2_Upload {
        [*] --> WaitingFiles

        state if_music <<choice>>
        WaitingFiles --> if_music: File Selected
        if_music --> AudioProcessing: Is Music
        if_music --> ImageProcessing: Is Art

        AudioProcessing --> AudioTrimming: Audio Loaded
        AudioTrimming --> PreviewReady: Trim Set
        ImageProcessing --> PreviewReady: Image Resized

        PreviewReady --> WaitingCover: Need Cover Art
        WaitingCover --> FilesComplete: Cover Uploaded
        PreviewReady --> FilesComplete: Art (No Cover)
    }

    Step2_Upload --> Step3_Details: Files Ready

    state "Step 3: Set Details" as Step3_Details {
        [*] --> EnteringDetails
        EnteringDetails --> DetailsValid: Title + Price Set
        DetailsValid --> EnteringDetails: Edit Fields
    }

    Step3_Details --> Step4_Review: Details Complete

    state "Step 4: Review & Mint" as Step4_Review {
        [*] --> ReviewIdle
        ReviewIdle --> Uploading: Click Mint

        state Uploading {
            [*] --> UploadPreview
            UploadPreview --> UploadFull: Preview Done
            UploadFull --> UploadCover: Full Done
            UploadCover --> UploadMetadata: Cover Done
            UploadMetadata --> UploadComplete: Metadata Done
        }

        Uploading --> Minting: Upload Complete
        Minting --> MintSuccess: TX Confirmed
        Minting --> MintError: TX Failed
        MintSuccess --> ShowResult: Display TokenId
        MintError --> ReviewIdle: Show Error
    }

    ShowResult --> Closed: Close Modal
    Step1_ChooseType --> Closed: Cancel
    Step2_Upload --> Closed: Cancel
    Step3_Details --> Closed: Cancel
    Step4_Review --> Closed: Cancel
```

**Step States (`currentStep`):**
- `1` - Type selection (music vs art)
- `2` - File upload + audio trimming
- `3` - Title, price, details
- `4` - Review and mint

**Upload Progress (`progressStage`):**
- `'preview'` → `'full'` → `'cover'` → `'metadata'` → `'complete'`

---

## 4. PassportRequirement

3-step passport minting requirement flow.

```mermaid
stateDiagram-v2
    [*] --> Welcome

    state "Welcome Screen" as Welcome {
        [*] --> ShowWelcome
        ShowWelcome --> DetectingLocation: Auto-detect
        DetectingLocation --> LocationReady: Got Country
        DetectingLocation --> LocationFailed: Geolocation Error
    }

    Welcome --> Requirements: Click Continue

    state "Requirements Screen" as Requirements {
        [*] --> CheckingStatus

        state "Follow Check" as FollowCheck {
            CheckingStatus --> NotFollowing: Not Following
            CheckingStatus --> IsFollowing: Already Following
            NotFollowing --> CheckingFollow: Click Verify
            CheckingFollow --> IsFollowing: Confirmed
            CheckingFollow --> NotFollowing: Not Found
        }

        state "Cast Check" as CastCheck {
            CheckingStatus --> NotCasted: No Cast
            CheckingStatus --> HasCasted: Cast Found
            NotCasted --> OpenComposer: Click Share
            OpenComposer --> CheckingCast: Return
            CheckingCast --> HasCasted: Cast Found
            CheckingCast --> NotCasted: Not Found
        }

        IsFollowing --> ReadyToMint: Both Complete
        HasCasted --> ReadyToMint: Both Complete
    }

    Requirements --> Minting: Click Mint Passport

    state "Minting Screen" as Minting {
        [*] --> MintIdle
        MintIdle --> CheckingDelegation: Start Mint
        CheckingDelegation --> CreatingDelegation: No Delegation
        CreatingDelegation --> ExecutingMint: Delegation Ready
        CheckingDelegation --> ExecutingMint: Has Delegation
        ExecutingMint --> MintSuccess: TX Confirmed
        ExecutingMint --> MintError: TX Failed
        MintError --> MintIdle: Retry
    }

    MintSuccess --> [*]: onPassportMinted()
```

**Step States (`currentStep`):**
- `'welcome'` - Introduction with country detection
- `'requirements'` - Follow + Cast verification
- `'minting'` - Transaction execution

---

## 5. FarcasterAppSetup

2-step Farcaster mini-app integration wizard.

```mermaid
stateDiagram-v2
    [*] --> CheckingStatus: Component Mount

    CheckingStatus --> AlreadyComplete: Both Steps Done
    CheckingStatus --> Step1: Not Added
    CheckingStatus --> Step2: Added, No Notifications

    AlreadyComplete --> [*]: onComplete()

    state "Step 1: Add to Farcaster" as Step1 {
        [*] --> AddIdle
        AddIdle --> Adding: Click Add
        Adding --> AddSuccess: SDK Success
        Adding --> AddError: SDK Failed
        AddError --> AddIdle: Retry
    }

    AddSuccess --> Step2

    state "Step 2: Enable Notifications" as Step2 {
        [*] --> NotifIdle
        NotifIdle --> Enabling: Click Enable
        Enabling --> NotifSuccess: SDK Success
        Enabling --> NotifError: SDK Failed
        NotifError --> NotifIdle: Retry
    }

    NotifSuccess --> [*]: onComplete()
```

**Boolean States:**
- `isAdded` - App added to Farcaster
- `notificationsEnabled` - Push notifications enabled

---

## 6. PassportStakingModal

MON staking with yield tracking and position management.

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> LoadingPositions: Open Modal

    LoadingPositions --> NoPositions: Empty
    LoadingPositions --> HasPositions: Positions Found
    LoadingPositions --> LoadError: Fetch Failed

    state "Staking View" as StakingView {
        NoPositions --> EnterAmount
        HasPositions --> ViewPositions

        state "Stake Flow" as StakeFlow {
            EnterAmount --> ValidAmount: Enter Amount
            ValidAmount --> Staking: Click Stake
            Staking --> StakeSuccess: TX Confirmed
            Staking --> StakeError: TX Failed
            StakeSuccess --> ViewPositions: Refresh
            StakeError --> EnterAmount: Show Error
        }

        state "Position Management" as PositionMgmt {
            ViewPositions --> UnstakeConfirm: Click Unstake
            UnstakeConfirm --> Unstaking: Confirm
            Unstaking --> UnstakeSuccess: TX Confirmed
            Unstaking --> UnstakeError: TX Failed
            UnstakeSuccess --> ViewPositions: Refresh
            UnstakeError --> ViewPositions: Show Error
        }
    }

    StakingView --> Closed: Close Modal
    LoadError --> Closed: Close Modal
```

**Transaction States:**
- `isStaking: boolean` - Stake transaction in progress
- `isUnstaking: string | null` - Position ID being unstaked

---

## 7. LiveRadioPlayer

Real-time radio streaming with queue management.

```mermaid
stateDiagram-v2
    [*] --> Offline: Component Mount

    Offline --> Connecting: Radio Goes Live
    Connecting --> Playing: Stream Connected
    Connecting --> ConnectionError: Failed
    ConnectionError --> Connecting: Retry

    state "Playing State" as Playing {
        [*] --> PlayingSong

        PlayingSong --> PlayingVoiceNote: Voice Note Starts
        PlayingVoiceNote --> PlayingSong: Voice Note Ends

        PlayingSong --> SongTransition: Song Ends
        SongTransition --> PlayingSong: Next Song Starts

        state "Queue Actions" as QueueActions {
            [*] --> QueueIdle
            QueueIdle --> Queueing: Click Queue Song
            Queueing --> QueueSuccess: TX Success
            Queueing --> QueueError: TX Failed
            QueueSuccess --> QueueIdle: Reset
            QueueError --> QueueIdle: Show Error
        }

        state "Voice Note Actions" as VoiceActions {
            [*] --> VoiceIdle
            VoiceIdle --> Recording: Hold Record
            Recording --> VoiceIdle: Release (< 1s)
            Recording --> Processing: Release (> 1s)
            Processing --> Submitting: Upload Complete
            Submitting --> VoiceSuccess: TX Success
            Submitting --> VoiceError: TX Failed
            VoiceSuccess --> VoiceIdle: Reset
            VoiceError --> VoiceIdle: Show Error
        }

        state "Tip Actions" as TipActions {
            [*] --> TipIdle
            TipIdle --> TipOpen: Click Tip
            TipOpen --> Tipping: Submit Tip
            Tipping --> TipSuccess: TX Success
            Tipping --> TipError: TX Failed
            TipSuccess --> TipIdle: Close
            TipError --> TipOpen: Show Error
        }
    }

    Playing --> Offline: Radio Stops
    Playing --> Paused: User Pauses
    Paused --> Playing: User Resumes
```

**Playback States:**
- `currentSong` - Currently playing track metadata
- `currentVoiceNote` - Currently playing voice note
- `playbackPhase` - `'song'` | `'voice_note'`
- `isLive` - Radio broadcast status

---

## 8. EnvioDashboard

Live statistics dashboard with periodic polling.

```mermaid
stateDiagram-v2
    [*] --> InitialLoad

    InitialLoad --> LoadSuccess: Data Fetched
    InitialLoad --> LoadError: Query Failed

    state "Dashboard View" as DashboardView {
        LoadSuccess --> DisplayStats
        DisplayStats --> Refreshing: 10s Timer
        Refreshing --> DisplayStats: Data Updated
        Refreshing --> DisplayStats: Query Failed (Keep Old)
    }

    LoadError --> Retrying: Click Retry
    Retrying --> LoadSuccess: Success
    Retrying --> LoadError: Failed Again
```

**Polling States:**
- `loading` - Initial or refresh loading
- `stats` - Cached statistics object
- `error` - Error message (null when ok)

---

## 9. UserSafeWidget

Safe wallet balance indicator with clipboard functionality.

```mermaid
stateDiagram-v2
    [*] --> Hidden: USE_USER_SAFES = false
    [*] --> Loading: USE_USER_SAFES = true

    Loading --> Display: Info Fetched
    Loading --> Error: Fetch Failed

    state Display {
        [*] --> ShowBalance
        ShowBalance --> Copied: Click Address
        Copied --> ShowBalance: 2s Timer
        ShowBalance --> Refreshing: 15s Timer
        Refreshing --> ShowBalance: Updated
    }

    Error --> Loading: Retry
```

**Visual States (based on balance):**
- Red badge: Balance = 0
- Yellow badge: Balance < 0.01 MON
- Green badge: Balance >= 0.01 MON

---

## 10. SwipeNavigation

Mobile gesture navigation wrapper.

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> TouchStart: Touch Begin
    TouchStart --> Swiping: Horizontal Movement
    TouchStart --> Idle: Vertical Movement (Scroll)

    Swiping --> SwipeLeft: deltaX < -threshold
    Swiping --> SwipeRight: deltaX > threshold
    Swiping --> Idle: Release (No Threshold)

    SwipeLeft --> NavigateNext: Valid Next Page
    SwipeRight --> NavigatePrev: Valid Prev Page
    SwipeLeft --> Idle: No Next Page
    SwipeRight --> Idle: No Prev Page

    NavigateNext --> Idle: Route Change
    NavigatePrev --> Idle: Route Change
```

**Gesture States:**
- `swipeProgress: 0-1` - Distance traveled
- `swipeDirection: 'left' | 'right' | null` - Current direction

---

## 11. Transaction State Pattern (Common)

Used across multiple components for blockchain operations.

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> Confirming: User Initiates
    Confirming --> Loading: Wallet Signed
    Confirming --> Idle: User Rejected

    Loading --> Success: TX Confirmed
    Loading --> Error: TX Failed/Reverted

    Success --> Idle: Auto Reset (1-2s)
    Error --> Idle: User Dismisses

    note right of Confirming
        Wallet popup shown
        Waiting for signature
    end note

    note right of Loading
        TX submitted to chain
        Waiting for confirmation
    end note
```

**Common `txState` Values:**
- `'idle'` - Ready for new action
- `'confirming'` - Waiting for wallet signature
- `'loading'` - Transaction pending
- `'success'` - Transaction confirmed
- `'error'` - Transaction failed

---

## 12. Multi-Step Wizard Pattern (Common)

Used for complex flows like NFT creation, passport minting.

```mermaid
stateDiagram-v2
    [*] --> Step1

    Step1 --> Step2: Complete & Next
    Step2 --> Step3: Complete & Next
    Step3 --> Step4: Complete & Next
    Step4 --> Complete: Final Action

    Step2 --> Step1: Back
    Step3 --> Step2: Back
    Step4 --> Step3: Back

    Step1 --> Cancelled: Cancel
    Step2 --> Cancelled: Cancel
    Step3 --> Cancelled: Cancel
    Step4 --> Cancelled: Cancel

    Complete --> [*]: Success Callback
    Cancelled --> [*]: Close Modal
```

**Step Progression:**
- `currentStep: number` - 1, 2, 3, 4...
- Each step validates before allowing progression
- Back navigation preserves entered data

---

## Summary

| Component | Primary Pattern | States Count | Async Operations |
|-----------|----------------|--------------|------------------|
| DailyAccessGate | Multi-requirement checklist | 5 requirement states + actions | 5 parallel checks |
| MirrorMate | Swipe matching + gestures | 4 tx states + gesture | Skip, Match, Register |
| CreateNFTModal | 4-step wizard | 4 steps + upload stages | Upload, Mint |
| PassportRequirement | 3-step wizard | 3 steps + 2 checks | Follow, Cast, Mint |
| FarcasterAppSetup | 2-step wizard | 2 boolean states | SDK calls |
| PassportStakingModal | Position management | Load + Stake + Unstake | Stake, Unstake |
| LiveRadioPlayer | Streaming + queue | Playback + 3 action types | Queue, Voice, Tip |
| EnvioDashboard | Polling display | Load + Display + Refresh | GraphQL polling |
| UserSafeWidget | Balance display | Load + Display | API polling |
| SwipeNavigation | Gesture tracking | Swipe direction + progress | None (client-side) |
