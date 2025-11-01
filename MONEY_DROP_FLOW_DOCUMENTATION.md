# Complete Money Drop Feature Flow Documentation

## Table of Contents

1. [Money Drop Account Creation Strategy](#money-drop-account-creation-strategy)
2. [Money Drop Creation Flow](#money-drop-creation-flow)
3. [Money Drop Claiming Flow](#money-drop-claiming-flow)
4. [Expiry and Refund Flow](#expiry-and-refund-flow)
5. [Database Schema and State Management](#database-schema-and-state-management)
6. [Error Handling and Edge Cases](#error-handling-and-edge-cases)

---

## Money Drop Account Creation Strategy

### Lazy vs Proactive Creation

**Lazy Creation (Current Implementation)**:

- Money drop Anchor account is created **ONLY when user creates their FIRST money drop**
- No account is created during onboarding/KYC
- Account creation happens on-demand during the first money drop creation
- **Benefits**:
  - Only creates accounts for users who actually use the feature
  - Saves Anchor resources (no unused accounts)
  - Simpler onboarding flow
  - No upfront costs

**Proactive Creation (Alternative - Not Implemented)**:

- Money drop Anchor account would be created when user completes onboarding/KYC
- Account exists before first money drop is created
- **Benefits**:
  - Faster first money drop creation (no account creation delay)
- **Drawbacks**:
  - Creates accounts for all users (even non-users of money drop)
  - More Anchor resources used
  - More complex onboarding flow

### How Lazy Creation Works

1. **User creates first money drop**:
   - Transaction-service checks if money drop account exists
   - If not found: Calls account-service to create Anchor account
   - Account-service creates new Anchor deposit account for money drop
   - Account record saved in database
   - Money drop proceeds with new account

2. **User creates subsequent money drops**:
   - Transaction-service finds existing money drop account
   - Reuses same account (only one money drop account per user)
   - No account creation needed
   - Faster operation

---

## Money Drop Creation Flow

### Phase 1: Frontend - User Interface and Input Collection

#### Step 1.1: Navigation to Create Drop Screen

- **Location**: `src/screens/Home/HomeScreen.tsx`
- **Trigger**: User taps "Money Drop" button in Quick Actions section
- **Navigation Action**:
  ```typescript
  navigation.navigate('CreateDropWizard' as never);
  ```
- **Route**: Defined in `src/navigation/AppStack.tsx` as `CreateDropWizard: undefined`

#### Step 1.2: Screen Initialization

- **Location**: `src/screens/MoneyDrop/CreateDropWizardScreen.tsx`
- **Components Loaded**:
  - `ScreenWrapper` - Provides safe area handling
  - `AppHeader` - Shows "Create a Money Drop" title with gift icon
  - Three `FormInput` components for:
    1. Amount per Person (₦) - numeric keyboard
    2. Number of People - number-pad keyboard
    3. Expiry Time (minutes) - number-pad keyboard, defaults to "60"
  - Total Amount display (read-only, calculated)
  - `PrimaryButton` - "Create Money Drop" CTA

#### Step 1.3: State Management

```typescript
const [amountPerClaim, setAmountPerClaim] = useState(''); // e.g., "500"
const [numberOfPeople, setNumberOfPeople] = useState(''); // e.g., "10"
const [expiryInMinutes, setExpiryInMinutes] = useState('60'); // Default: 1 hour
```

#### Step 1.4: Balance Check and Total Calculation

- **Hook Used**: `useAccountBalance()` from `src/api/transactionApi.ts`
- **Query Endpoint**: `GET /transactions/account/balance`
- **Purpose**: Fetches current available balance in kobo for validation
- **Total Calculation**:
  ```typescript
  const totalAmount = useMemo(() => {
    const amount = parseFloat(amountPerClaim); // e.g., 500
    const people = parseInt(numberOfPeople, 10); // e.g., 10
    if (!isNaN(amount) && !isNaN(people) && amount > 0 && people > 0) {
      return amount * people; // e.g., 5000 naira
    }
    return 0;
  }, [amountPerClaim, numberOfPeople]);
  ```
- **Display**: Shows formatted total: `formatCurrency(nairaToKobo(totalAmount))`
  - Example: `"₦5,000.00"` for 500 naira × 10 people = 5000 naira

#### Step 1.5: User Input Validation (Frontend)

When user clicks "Create Money Drop" button, `handleCreateDrop()` executes:

```typescript
const handleCreateDrop = () => {
  // 1. Convert naira to kobo for backend
  const amountKobo = nairaToKobo(parseFloat(amountPerClaim)); // 500 → 50000 kobo
  const people = parseInt(numberOfPeople, 10); // "10" → 10
  const expiry = parseInt(expiryInMinutes, 10); // "60" → 60
  const totalAmountKobo = nairaToKobo(totalAmount); // 5000 → 500000 kobo

  // 2. Validation Checks
  if (isNaN(amountKobo) || amountKobo <= 0) {
    Alert.alert('Invalid Input', 'Please enter a valid amount per person.');
    return;
  }
  if (isNaN(people) || people <= 0) {
    Alert.alert('Invalid Input', 'Please enter a valid number of people.');
    return;
  }
  if (isNaN(expiry) || expiry <= 0) {
    Alert.alert('Invalid Input', 'Please enter a valid expiry time in minutes.');
    return;
  }
  if (balanceData && balanceData.available_balance < totalAmountKobo) {
    Alert.alert(
      'Insufficient Funds',
      'You do not have enough money in your wallet to fund this drop.'
    );
    return;
  }

  // 3. Prepare payload
  const payload = {
    amount_per_claim: amountKobo, // 50000 (in kobo)
    number_of_people: people, // 10
    expiry_in_minutes: expiry, // 60
  };

  // 4. Trigger secure action (PIN/Biometric)
  triggerSecureAction(() => createMoneyDrop(payload));
};
```

#### Step 1.6: Security Authorization

- **Hook Used**: `useSecureAction()` from `src/hooks/useSecureAction.ts`
- **Flow**:
  1. Checks if development mode is enabled (`EXPO_PUBLIC_SKIP_PIN_CHECK=true`)
     - If yes: Bypasses authentication, executes action immediately
  2. Checks if PIN is set (`useSecurityStore`)
     - If not: Shows alert "Please set up a transaction PIN"
  3. If biometrics enabled:
     - Attempts `ReactNativeBiometrics.simplePrompt()`
     - Success: Executes action
     - Failure/Cancel: Falls back to PIN modal
  4. PIN Modal (`PinInputModal`):
     - User enters PIN
     - Validates against stored PIN
     - Success: Executes action
     - Failure: Shows error "Incorrect PIN. Please try again."

#### Step 1.7: API Request Preparation

- **Hook Used**: `useCreateMoneyDrop()` from `src/api/transactionApi.ts`
- **Function**: `createMoneyDropMutation`
- **Endpoint**: `POST /transactions/money-drops`
- **Base URL**: `EXPO_PUBLIC_TRANSACTION_SERVICE_URL` or `http://localhost:8083`
- **Request Headers** (automatically added by `apiClient` interceptor):
  ```
  Authorization: Bearer <Clerk JWT Token>
  X-Clerk-User-Id: <clerk_user_id>
  Content-Type: application/json
  ```
- **Request Body** (JSON):
  ```json
  {
    "amount_per_claim": 50000, // in kobo (₦500.00)
    "number_of_people": 10,
    "expiry_in_minutes": 60
  }
  ```

### Phase 2: Backend - Request Processing

#### Step 2.1: API Gateway / Router

- **Location**: `transfa-backend/transaction-service/internal/api/router.go`
- **Route Pattern**:
  ```go
  r.Route("/money-drops", func(r chi.Router) {
    r.Post("/", h.CreateMoneyDropHandler)  // POST /transactions/money-drops
  })
  ```
- **Middleware**:
  - Authentication middleware extracts Clerk JWT
  - Sets `ClerkUserID` in request context

#### Step 2.2: HTTP Handler Processing

- **Location**: `transfa-backend/transaction-service/internal/api/handlers_moneydrop.go`
- **Function**: `CreateMoneyDropHandler(w http.ResponseWriter, r *http.Request)`

**Step 2.2.1: Extract User ID**

```go
userIDStr, ok := GetClerkUserID(r.Context())
if !ok {
    h.writeError(w, http.StatusUnauthorized, "Could not get user ID from context")
    return
}
```

**Step 2.2.2: Resolve Internal User ID**

```go
internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
// Calls auth-service to map Clerk ID → Internal UUID
// Example: "user_abc123" → "550e8400-e29b-41d4-a716-446655440000"
```

**Step 2.2.3: Parse User ID**

```go
userID, err := uuid.Parse(internalIDStr)
if err != nil {
    h.writeError(w, http.StatusBadRequest, "Invalid user ID format")
    return
}
```

**Step 2.2.4: Parse Request Body**

```go
var req domain.CreateMoneyDropRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
    h.writeError(w, http.StatusBadRequest, "Invalid request body")
    return
}
// req.AmountPerClaim = 50000
// req.NumberOfPeople = 10
// req.ExpiryInMinutes = 60
```

**Step 2.2.5: Request Validation**

```go
if req.AmountPerClaim <= 0 {
    h.writeError(w, http.StatusBadRequest, "Amount per claim must be greater than 0")
    return
}
if req.NumberOfPeople <= 0 {
    h.writeError(w, http.StatusBadRequest, "Number of people must be greater than 0")
    return
}
if req.ExpiryInMinutes <= 0 {
    h.writeError(w, http.StatusBadRequest, "Expiry time must be greater than 0")
    return
}
```

**Step 2.2.6: Call Service Layer**

```go
response, err := h.service.CreateMoneyDrop(r.Context(), userID, req)
if err != nil {
    log.Printf("Create Money Drop: Service error: %v", err)
    if err.Error() == "insufficient funds in primary wallet" {
        h.writeError(w, http.StatusBadRequest, err.Error())
        return
    }
    h.writeError(w, http.StatusInternalServerError, "Failed to create money drop")
    return
}

h.writeJSON(w, http.StatusCreated, response)
```

### Phase 3: Backend - Service Layer Processing

#### Step 3.1: Service Method Entry

- **Location**: `transfa-backend/transaction-service/internal/app/service.go`
- **Function**: `CreateMoneyDrop(ctx context.Context, userID uuid.UUID, req domain.CreateMoneyDropRequest)`

**Step 3.1.1: Log Entry**

```go
log.Printf("CreateMoneyDrop: Starting creation for user %s", userID)
```

**Step 3.1.2: Get Primary Account**

```go
primaryAccount, err := s.repo.FindAccountByUserID(ctx, userID)
// Repository query:
// SELECT id, user_id, anchor_account_id, balance
// FROM accounts
// WHERE user_id = $1 AND account_type = 'primary'
// Returns: account with AnchorAccountID (e.g., "acc_anchor_123")
```

**Step 3.1.3: Sync Balance with Anchor**

```go
if err := s.syncAccountBalance(ctx, userID); err != nil {
    log.Printf("CreateMoneyDrop: Failed to sync balance for %s: %v", userID, err)
    // Continues even if sync fails - will validate against Anchor directly
}
```

**Balance Sync Process**:

1. Gets account from database
2. Calls Anchor API: `GET /accounts/{anchor_account_id}/balance`
3. Updates internal database balance:
   ```sql
   UPDATE accounts
   SET balance = $1
   WHERE user_id = $2
   ```

**Step 3.1.4: Validate Funds with Anchor (Including Fee)**

```go
anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, primaryAccount.AnchorAccountID)
// HTTP GET to Anchor API
// Returns: { "data": { "available_balance": 1000000 } } // in kobo

totalAmount := req.AmountPerClaim * int64(req.NumberOfPeople)
// 50000 * 10 = 500000 kobo (₦5,000.00)

moneyDropFee := s.moneyDropFeeKobo // From environment variable MONEY_DROP_FEE_KOBO
// Default: 0 (no fee), can be configured via env var
// Example: MONEY_DROP_FEE_KOBO=1000 (₦10.00 fee)
// Alternative env vars: MONEY_DROP_FEE or MONEY_DROP_FEE_NAIRA (in whole currency units)

requiredAmount := totalAmount + moneyDropFee
// Example: 500000 + 1000 = 501000 kobo (₦5,010.00 total required)

if anchorBalance.Data.AvailableBalance < requiredAmount {
    return nil, errors.New("insufficient funds in primary wallet")
}
log.Printf("CreateMoneyDrop: Total amount: %d, Fee: %d, Required: %d", totalAmount, moneyDropFee, requiredAmount)
```

**Fee Configuration**:

- **Environment Variable**: `MONEY_DROP_FEE_KOBO` (in kobo, e.g., `1000` = ₦10.00)
- **Alternative Variables**:
  - `MONEY_DROP_FEE` (in whole currency units, e.g., `10` = ₦10.00)
  - `MONEY_DROP_FEE_NAIRA` (in whole currency units, e.g., `10` = ₦10.00)
- **Default**: `0` (no fee charged)
- **Location**: `transfa-backend/transaction-service/internal/config/config.go`

**Step 3.1.5: Get or Create Money Drop Account via Account-Service**

```go
moneyDropAccount, err := s.repo.FindMoneyDropAccountByUserID(ctx, userID)
if err != nil && !errors.Is(err, store.ErrAccountNotFound) {
    return nil, fmt.Errorf("failed to get user's money drop account: %w", err)
}
```

**If Account Doesn't Exist or Doesn't Have Anchor Account**:

```go
// Call account-service to create money drop Anchor account (LAZY CREATION)
accountResp, err := s.accountClient.CreateMoneyDropAccount(ctx, userID.String())
```

**Account-Service Process** (`POST /internal/accounts/money-drop`):

1. Checks if money drop account exists in database
2. If exists but no Anchor account: Updates account with Anchor details
3. If doesn't exist:
   - Gets user's Anchor customer ID from database
   - Creates new Anchor deposit account (Product: "SAVINGS")
   - Fetches Virtual NUBAN for the account
   - Creates or updates account record in database with `account_type = 'money_drop'`
4. Returns: `AccountID`, `AnchorAccountID`, `VirtualNUBAN`, `BankName`

**Anchor API Calls**:

- `POST /api/v1/accounts` - Create deposit account
- `GET /api/v1/accounts/{accountId}?include=AccountNumber` - Get Virtual NUBAN

**Update Local Account Record**:

```go
if moneyDropAccount == nil {
    // Create new account record
    newAccount := &domain.Account{
        UserID:          userID,
        AnchorAccountID: accountResp.AnchorAccountID,  // NEW SEPARATE Anchor account
        Balance:         0,
    }
    moneyDropAccount, err = s.repo.CreateAccount(ctx, newAccount)
} else {
    // Account already exists in database (from account-service)
    // Re-fetch to get updated Anchor account ID
    moneyDropAccount, err = s.repo.FindMoneyDropAccountByUserID(ctx, userID)
}
```

**Key Difference**: Money drop accounts now have their **OWN separate Anchor account** (not sharing with primary account).

**Step 3.1.6: Debit Wallet and Collect Fee**

```go
// Debit required amount (total + fee) from primary account in database
if err := s.repo.DebitWallet(ctx, userID, requiredAmount); err != nil {
    return nil, fmt.Errorf("failed to debit primary wallet: %w", err)
}

// Collect the money drop creation fee to admin account (if fee > 0)
if s.moneyDropFeeKobo > 0 {
    // Create temporary transaction record for fee collection
    tempFeeTx := &domain.Transaction{
        ID:              uuid.New(),
        SenderID:        userID,
        SourceAccountID: primaryAccount.ID,
        Type:            "money_drop_fee",
        Category:        "Money Drop",
        Status:          "pending",
        Amount:          0,
        Fee:             s.moneyDropFeeKobo,
        Description:     "Money Drop Creation Fee",
    }
    if err := s.collectTransactionFee(ctx, tempFeeTx, primaryAccount, s.moneyDropFeeKobo, "Money Drop Creation Fee"); err != nil {
        log.Printf("WARN: Failed to collect money drop creation fee: %v", err)
        // Don't fail the operation, just log the warning
    }
}
```

**Fee Collection Process**:

1. If `MONEY_DROP_FEE_KOBO > 0`, fee is collected via Anchor Book Transfer
2. Fee transferred from creator's primary Anchor account to admin account (`ADMIN_ACCOUNT_ID`)
3. Fee is logged in database with transaction type `money_drop_fee`
4. Fee amount is recorded in the `fee` column of the `transactions` table

**Step 3.1.7: Transfer Funds via Book Transfer**

```go
// Transfer funds from primary account to money drop account via Book Transfer
reason := fmt.Sprintf("Money Drop Funding - Total: %d kobo", totalAmount)
_, err = s.anchorClient.InitiateBookTransfer(
    ctx,
    primaryAccount.AnchorAccountID,    // From: Creator's primary Anchor account
    moneyDropAccount.AnchorAccountID,  // To: Creator's money drop Anchor account
    reason,
    totalAmount  // Only the amount for the drop (fee already debited separately)
)
```

**Anchor Book Transfer API Call**:

- **Method**: `POST /transfers/book`
- **Request Body**:
  ```json
  {
    "from_account_id": "acc_primary_123",
    "to_account_id": "acc_money_drop_456", // Separate money drop account
    "amount": 500000,
    "reason": "Money Drop Funding - Total: 500000 kobo"
  }
  ```
- **Response**: Returns transfer ID and status

**Note**: The database balance was already debited in Step 3.1.6 (including the fee). The Book Transfer in Step 3.1.7 only moves the drop amount to the money drop account. The fee remains in the creator's primary account until it's transferred to the admin account via fee collection.

**Note**: The Book Transfer physically moves funds from primary to money drop account in Anchor. The database balance update is for consistency and will sync with Anchor later.

**Debit Operation** (atomic database transaction):

```sql
BEGIN TRANSACTION;

-- Get current balance with row lock
SELECT balance FROM accounts
WHERE user_id = $1 AND account_type = 'primary'
FOR UPDATE;

-- Check sufficient funds
IF balance < $2 THEN
    ROLLBACK;
    RETURN ERROR "insufficient funds";
END IF;

-- Debit amount
UPDATE accounts
SET balance = balance - $2, updated_at = NOW()
WHERE user_id = $1 AND account_type = 'primary';

COMMIT;
```

**Step 3.1.7: Create Money Drop Record**

```go
expiry := time.Now().Add(time.Duration(req.ExpiryInMinutes) * time.Minute)
// Example: Now + 60 minutes = "2024-01-15 14:30:00"

drop := &domain.MoneyDrop{
    CreatorID:            userID,
    Status:               "active",
    AmountPerClaim:       req.AmountPerClaim,           // 50000
    TotalClaimsAllowed:   req.NumberOfPeople,            // 10
    ClaimsMadeCount:      0,
    ExpiryTimestamp:      expiry,                        // Future timestamp
    FundingSourceAccountID: primaryAccount.ID,
    MoneyDropAccountID:   moneyDropAccount.ID,
}

createdDrop, err := s.repo.CreateMoneyDrop(ctx, drop)
```

**Database Insert**:

```sql
INSERT INTO money_drops (
    creator_id, status, amount_per_claim, total_claims_allowed,
    claims_made_count, expiry_timestamp, funding_source_account_id, money_drop_account_id
)
VALUES ($1, 'active', $2, $3, 0, $4, $5, $6)
RETURNING id, created_at;
-- Returns: UUID for drop_id and timestamp
```

**If Insert Fails**:

```go
// Refund the Book Transfer since drop creation failed
// Transfer back from money drop account to primary account
refundReason := fmt.Sprintf("Money Drop Creation Failed - Refund")
if refundErr := s.anchorClient.InitiateBookTransfer(
    ctx,
    moneyDropAccount.AnchorAccountID,  // From: Money drop account
    primaryAccount.AnchorAccountID,    // To: Primary account
    refundReason,
    totalAmount
); refundErr != nil {
    log.Printf("CRITICAL: Failed to refund Book Transfer for user %s: %v", userID, refundErr)
    // Also try to credit the database balance
    if dbRefundErr := s.repo.CreditWallet(ctx, userID, totalAmount); dbRefundErr != nil {
        log.Printf("CRITICAL: Failed to refund debited amount in database: %v", dbRefundErr)
    }
}
return nil, fmt.Errorf("failed to create money drop record: %w", err)
```

**Step 3.1.8: Log Funding Transaction**

```go
fundingTx := &domain.Transaction{
    ID:              uuid.New(),
    SenderID:        userID,
    SourceAccountID: primaryAccount.ID,
    DestinationAccountID: &moneyDropAccount.ID,
    Type:            "money_drop_funding",
    Category:        "Money Drop",
    Status:          "completed",
    Amount:          totalAmount,        // 500000
    Fee:             s.moneyDropFeeKobo,  // Fee amount recorded in database
    Description:     fmt.Sprintf("Funding for Money Drop #%s", createdDrop.ID.String()),
}
```

**Transaction Record Details**:

- `amount`: The total drop amount (AmountPerClaim \* NumberOfPeople)
- `fee`: The money drop creation fee (from `MONEY_DROP_FEE_KOBO` env var)
- `type`: `money_drop_funding`
- `category`: `Money Drop`
- Both amount and fee are recorded in the database for audit and reporting purposes

if err := s.repo.CreateTransaction(ctx, fundingTx); err != nil {
log.Printf("WARN: Failed to log money drop funding transaction: %v", err)
// Don't fail the operation, the drop is already created
}

````

**Transaction Log Insert**:

```sql
INSERT INTO transactions (
    id, sender_id, recipient_id, source_account_id, destination_account_id,
    type, category, status, amount, fee, description, created_at
)
VALUES ($1, $2, NULL, $3, $4, 'money_drop_funding', 'Money Drop',
        'completed', $5, 0, $6, NOW());
````

**Step 3.1.9: Prepare Response**

```go
dropIDStr := createdDrop.ID.String()
response := &domain.CreateMoneyDropResponse{
    MoneyDropID:      dropIDStr,                          // "550e8400-e29b-41d4-a716-446655440000"
    QRCodeContent:    fmt.Sprintf("transfa://claim-drop/%s", dropIDStr),
    // "transfa://claim-drop/550e8400-e29b-41d4-a716-446655440000"
    ShareableLink:    fmt.Sprintf("https://transfa.app/claim?drop_id=%s", dropIDStr),
    // "https://transfa.app/claim?drop_id=550e8400-e29b-41d4-a716-446655440000"
    TotalAmount:      totalAmount,                       // 500000 (kobo)
    AmountPerClaim:   req.AmountPerClaim,                // 50000 (kobo)
    NumberOfPeople:   req.NumberOfPeople,                // 10
    ExpiryTimestamp:  expiry,                            // ISO 8601 timestamp
}

log.Printf("CreateMoneyDrop: Successfully created money drop %s for user %s", dropIDStr, userID)
return response, nil
```

### Phase 4: Frontend - Success Response Handling

#### Step 4.1: API Response Reception

- **Status Code**: `201 Created`
- **Response Body** (JSON):
  ```json
  {
    "money_drop_id": "550e8400-e29b-41d4-a716-446655440000",
    "qr_code_content": "transfa://claim-drop/550e8400-e29b-41d4-a716-446655440000",
    "shareable_link": "https://transfa.app/claim?drop_id=550e8400-e29b-41d4-a716-446655440000",
    "total_amount": 500000,
    "amount_per_claim": 50000,
    "number_of_people": 10,
    "expiry_timestamp": "2024-01-15T14:30:00Z"
  }
  ```

#### Step 4.2: TanStack Query Mutation Success

- **Hook**: `useCreateMoneyDrop()`
- **onSuccess Callback**:
  ```typescript
  onSuccess: (data) => {
    // Navigate to success screen with drop details
    navigation.replace('MoneyDropSuccess', { dropDetails: data });
  };
  ```
- **Cache Invalidation**:
  ```typescript
  queryClient.invalidateQueries({ queryKey: [ACCOUNT_BALANCE_QUERY_KEY] });
  // Triggers refetch of account balance to reflect debit
  ```

#### Step 4.3: Success Screen Display

- **Location**: `src/screens/MoneyDrop/MoneyDropSuccessScreen.tsx`
- **Components Rendered**:
  1. Success icon (checkmark-circle, green)
  2. Title: "Money Drop Created!"
  3. QR Code (using `react-native-qrcode-svg`)
     - Value: `dropDetails.qr_code_content`
     - Size: 200x200
  4. Details Card showing:
     - Total Amount: `formatCurrency(dropDetails.total_amount)` → "₦5,000.00"
     - Amount per Person: `formatCurrency(dropDetails.amount_per_claim)` → "₦500.00"
     - For: `dropDetails.number_of_people` → "10 People"
     - Expires: `new Date(dropDetails.expiry_timestamp).toLocaleString()`
  5. Shareable Link (touchable, copies to clipboard via Share API)
  6. "Done" button → navigates to Home

---

## Money Drop Claiming Flow

### Phase 1: Recipient - Accessing the Money Drop

#### Step 1.1: Link/QR Code Access

- **Methods**:
  1. QR Code Scan: Scanner app reads `transfa://claim-drop/{drop_id}`
  2. Deep Link: App receives `transfa://claim-drop/{drop_id}` URL
  3. Web Link: Opens `https://transfa.app/claim?drop_id={drop_id}`
     - Web page redirects to app via deep link

#### Step 1.2: Navigation to Claim Screen

- **Route**: `ClaimDrop: { dropId: string }`
- **Screen**: `src/screens/MoneyDrop/ClaimDropScreen.tsx`
- **Route Params**: Extracted from URL parameter `drop_id`

#### Step 1.3: Fetch Money Drop Details

- **Hook**: `useMoneyDropDetails(dropId)` from `src/api/transactionApi.ts`
- **Query Endpoint**: `GET /transactions/money-drops/{drop_id}/details`
- **Request Headers**:
  ```
  Authorization: Bearer <Claimant's Clerk JWT>
  X-Clerk-User-Id: <claimant_clerk_id>
  ```

#### Step 1.4: Backend - Get Details Handler

- **Location**: `transfa-backend/transaction-service/internal/api/handlers_moneydrop.go`
- **Function**: `GetMoneyDropDetailsHandler`

```go
dropIDStr := chi.URLParam(r, "drop_id")
dropID, err := uuid.Parse(dropIDStr)

details, err := h.service.GetMoneyDropDetails(r.Context(), dropID)
h.writeJSON(w, http.StatusOK, details)
```

#### Step 1.5: Backend - Service Get Details

- **Location**: `transfa-backend/transaction-service/internal/app/service.go`
- **Function**: `GetMoneyDropDetails(ctx context.Context, dropID uuid.UUID)`

```go
drop, err := s.repo.FindMoneyDropByID(ctx, dropID)
// SQL: SELECT * FROM money_drops WHERE id = $1

creator, err := s.repo.FindMoneyDropCreatorByDropID(ctx, dropID)
// SQL: SELECT u.id, u.username, u.allow_sending, u.anchor_customer_id
//      FROM users u
//      INNER JOIN money_drops md ON u.id = md.creator_id
//      WHERE md.id = $1

details := &domain.MoneyDropDetails{
    ID:              drop.ID,
    CreatorUsername: creator.Username,
    AmountPerClaim:  drop.AmountPerClaim,
    Status:          drop.Status,
    IsClaimable:     false,
    Message:         "",
}

// Determine if drop is claimable
if drop.Status != "active" {
    details.Message = "This money drop is no longer active."
    details.IsClaimable = false
} else if time.Now().After(drop.ExpiryTimestamp) {
    details.Message = "This money drop has expired."
    details.IsClaimable = false
} else if drop.ClaimsMadeCount >= drop.TotalClaimsAllowed {
    details.Message = "This money drop has been fully claimed."
    details.IsClaimable = false
} else {
    details.Message = "You can claim this money drop!"
    details.IsClaimable = true
}
```

#### Step 1.6: Frontend - Display Details

- **Loading State**: Shows `ActivityIndicator`
- **Error State**: Shows error message
- **Unclaimable State**: Shows warning icon + message (expired/full/inactive)
- **Claimable State**: Shows:
  - Title: "You're Invited!"
  - Subtitle: "{creator_username} has sent you a money drop."
  - Amount Card: Large display of `formatCurrency(dropDetails.amount_per_claim)`
  - "Claim Now" button

### Phase 2: Claiming Process

#### Step 2.1: User Initiates Claim

- **Action**: User taps "Claim Now" button
- **Function**: `handleClaim()` calls `claimDrop({ dropId })`

#### Step 2.2: API Claim Request

- **Hook**: `useClaimMoneyDrop()` from `src/api/transactionApi.ts`
- **Endpoint**: `POST /transactions/money-drops/{drop_id}/claim`
- **Request Body**: Empty `{}`
- **Request Headers**:
  ```
  Authorization: Bearer <Claimant's Clerk JWT>
  X-Clerk-User-Id: <claimant_clerk_id>
  ```

#### Step 2.3: Backend - Claim Handler

- **Location**: `transfa-backend/transaction-service/internal/api/handlers_moneydrop.go`
- **Function**: `ClaimMoneyDropHandler`

```go
// Extract claimant ID
userIDStr, ok := GetClerkUserID(r.Context())
internalIDStr, err := h.service.ResolveInternalUserID(r.Context(), userIDStr)
claimantID, err := uuid.Parse(internalIDStr)

// Extract drop ID from URL
dropIDStr := chi.URLParam(r, "drop_id")
dropID, err := uuid.Parse(dropIDStr)

// Process claim
response, err := h.service.ClaimMoneyDrop(r.Context(), claimantID, dropID)
h.writeJSON(w, http.StatusOK, response)
```

#### Step 2.4: Backend - Service Claim Processing

- **Location**: `transfa-backend/transaction-service/internal/app/service.go`
- **Function**: `ClaimMoneyDrop(ctx context.Context, claimantID uuid.UUID, dropID uuid.UUID)`

**Step 2.4.1: Get Drop Details**

```go
drop, err := s.repo.FindMoneyDropByID(ctx, dropID)
if err != nil {
    return nil, fmt.Errorf("invalid money drop ID: %w", err)
}

if drop.CreatorID == claimantID {
    return nil, errors.New("you cannot claim your own money drop")
}
```

**Step 2.4.2: Get Claimant's Account**

```go
claimantAccount, err := s.repo.FindAccountByUserID(ctx, claimantID)
// Gets claimant's primary account
```

**Step 2.4.3: Get Money Drop Account**

```go
moneyDropAccount, err := s.repo.FindMoneyDropAccountByUserID(ctx, drop.CreatorID)
// Gets creator's money_drop account
```

**Step 2.4.4: Atomic Claim Operation**

```go
err = s.repo.ClaimMoneyDropAtomic(ctx, dropID, claimantID, claimantAccount.ID, moneyDropAccount.ID, drop.AmountPerClaim)
```

**Atomic Database Transaction**:

```sql
BEGIN TRANSACTION;

-- 1. Lock money_drops row and validate
SELECT claims_made_count, total_claims_allowed, status, expiry_timestamp
FROM money_drops
WHERE id = $1
FOR UPDATE;

-- Validation checks:
-- - status must be 'active'
-- - expiry_timestamp must be in the future
-- - claims_made_count < total_claims_allowed

-- 2. Check if user already claimed
SELECT COUNT(*) FROM money_drop_claims
WHERE drop_id = $1 AND claimant_id = $2;
-- If count > 0: ROLLBACK and return error "already claimed"

-- 3. Update claim count
UPDATE money_drops
SET claims_made_count = claims_made_count + 1
WHERE id = $1;

-- 4. Insert claim record
INSERT INTO money_drop_claims (drop_id, claimant_id, claimed_at)
VALUES ($1, $2, NOW());

-- 5. Log transaction
INSERT INTO transactions (
    sender_id, recipient_id, source_account_id, destination_account_id,
    type, category, status, amount, fee, description
)
SELECT creator_id, $3, $4, $5, 'money_drop_claim', 'Money Drop', 'pending', $6, 0, 'Money Drop Claim'
FROM money_drops
WHERE id = $1;

COMMIT;
```

**Step 2.4.5: Get Creator Details**

```go
creator, err := s.repo.FindMoneyDropCreatorByDropID(ctx, dropID)
```

**Step 2.4.6: Verify Money Drop Account Has Anchor Account ID**

```go
if moneyDropAccount.AnchorAccountID == "" {
    return nil, fmt.Errorf("money drop account does not have an Anchor account ID")
}
```

**Step 2.4.7: Initiate Book Transfer from Money Drop Account**

```go
reason := fmt.Sprintf("Money Drop Claim by %s", creator.Username)

_, err = s.anchorClient.InitiateBookTransfer(
    ctx,
    moneyDropAccount.AnchorAccountID,  // From: Creator's MONEY DROP Anchor account
    claimantAccount.AnchorAccountID,    // To: Claimant's PRIMARY Anchor account
    reason,                              // "Money Drop Claim by creator_username"
    drop.AmountPerClaim                  // 50000 kobo
)
```

**Anchor API Call**:

- **Method**: `POST /transfers/book`
- **Request Body**:
  ```json
  {
    "from_account_id": "acc_money_drop_456", // Creator's money drop account
    "to_account_id": "acc_claimant_789", // Claimant's primary account
    "amount": 50000,
    "reason": "Money Drop Claim by creator_username"
  }
  ```
- **Response**: Returns transfer ID and status
- **Key Difference**: Funds are transferred from the **money drop account** (not creator's primary), ensuring physical fund separation
- **Note**: If Anchor call fails, error is logged but claim is already recorded in database. Webhook handler will update transaction status later.

**Step 2.4.8: Prepare Response**

```go
response := &domain.ClaimMoneyDropResponse{
    Message:        "Money drop claimed successfully!",
    AmountClaimed:  drop.AmountPerClaim,      // 50000
    CreatorUsername: creator.Username,        // "creator_username"
}

log.Printf("ClaimMoneyDrop: Successfully processed claim for drop %s by user %s", dropID, claimantID)
return response, nil
```

#### Step 2.5: Frontend - Claim Success Response

- **Status Code**: `200 OK`
- **Response Body**:
  ```json
  {
    "message": "Money drop claimed successfully!",
    "amount_claimed": 50000,
    "creator_username": "creator_username"
  }
  ```

#### Step 2.6: Frontend - Success Handling

- **onSuccess Callback**:
  ```typescript
  onSuccess: (data) => {
    setClaimResult({ success: true, message: data.message });
    Alert.alert(
      'Success!',
      `You've successfully claimed ${formatCurrency(data.amount_claimed)} from ${data.creator_username}.`
    );
  };
  ```
- **Cache Invalidation**:
  ```typescript
  queryClient.invalidateQueries({ queryKey: [ACCOUNT_BALANCE_QUERY_KEY] });
  // Refetches balance to show new credit
  ```
- **UI Update**: Shows success icon, message, and "Go to Home" button

---

## Expiry and Refund Flow

### Phase 1: Scheduler Job Execution

#### Step 1.1: Cron Schedule

- **Location**: `transfa-backend/scheduler-service/internal/app/scheduler.go`
- **Schedule**: `MONEY_DROP_EXPIRY_SCHEDULE` (default: `"*/5 * * * *"` = every 5 minutes)
- **Function**: `ProcessMoneyDropExpiry()`

#### Step 1.2: Find Expired/Completed Drops

- **Location**: `transfa-backend/scheduler-service/internal/store/repository.go`
- **Query**:
  ```sql
  SELECT id, creator_id, amount_per_claim, total_claims_allowed,
         claims_made_count, funding_source_account_id, money_drop_account_id
  FROM money_drops
  WHERE status = 'active'
    AND (expiry_timestamp <= NOW() OR claims_made_count >= total_claims_allowed)
  ```

#### Step 1.3: Calculate Refund Amount

```go
for _, drop := range drops {
    totalAmount := drop.AmountPerClaim * int64(drop.TotalClaimsAllowed)
    claimedAmount := drop.AmountPerClaim * int64(drop.ClaimsMadeCount)
    remainingBalance := totalAmount - claimedAmount

    if remainingBalance > 0 {
        // Call transaction-service to refund
        err := j.txClient.RefundMoneyDrop(ctx, drop.ID, drop.CreatorID, remainingBalance)
    }

    // Mark as processed
    j.repo.UpdateMoneyDropStatus(ctx, drop.ID, "expired_and_refunded")
}
```

#### Step 1.4: Refund API Call

- **Endpoint**: `POST /transactions/internal/money-drops/refund`
- **Request Body**:
  ```json
  {
    "drop_id": "550e8400-e29b-41d4-a716-446655440000",
    "creator_id": "creator-uuid",
    "amount": 250000
  }
  ```

#### Step 1.5: Backend Refund Handler

- **Location**: `transfa-backend/transaction-service/internal/api/handlers_moneydrop.go`
- **Function**: `RefundMoneyDropHandler` (no authentication required - internal endpoint)

```go
dropID, err := uuid.Parse(req.DropID)
creatorID, err := uuid.Parse(req.CreatorID)

err := h.service.RefundMoneyDrop(r.Context(), dropID, creatorID, req.Amount)
```

#### Step 1.6: Service Refund Processing

- **Location**: `transfa-backend/transaction-service/internal/app/service.go`
- **Function**: `RefundMoneyDrop(ctx context.Context, dropID uuid.UUID, creatorID uuid.UUID, amount int64)`

```go
// Get creator's primary account
creatorAccount, err := s.repo.FindAccountByUserID(ctx, creatorID)

// Get money drop account
moneyDropAccount, err := s.repo.FindMoneyDropAccountByUserID(ctx, creatorID)

// Verify money drop account has Anchor account ID
if moneyDropAccount.AnchorAccountID == "" {
    return fmt.Errorf("money drop account does not have an Anchor account ID")
}

// Transfer funds from money drop account back to primary account via Book Transfer
reason := fmt.Sprintf("Money Drop Refund - Amount: %d kobo", amount)
_, err = s.anchorClient.InitiateBookTransfer(
    ctx,
    moneyDropAccount.AnchorAccountID,  // From: Money drop account
    creatorAccount.AnchorAccountID,     // To: Creator's primary account
    reason,
    amount
)
```

**Anchor Book Transfer API Call**:

- **Method**: `POST /transfers/book`
- **Request Body**:
  ```json
  {
    "from_account_id": "acc_money_drop_456",
    "to_account_id": "acc_creator_primary_123",
    "amount": 250000,
    "reason": "Money Drop Refund - Amount: 250000 kobo"
  }
  ```

**Update Database Balance**:

```go
// Update database balance (credit primary)
if err := s.repo.CreditWallet(ctx, creatorID, amount); err != nil {
    log.Printf("WARN: Failed to update primary account balance in database: %v", err)
    // Don't fail - Anchor transfer succeeded, balance will sync later
}
```

**Log Refund Transaction**:

```go
refundTx := &domain.Transaction{
    ID:              uuid.New(),
    SenderID:        creatorID,
    SourceAccountID: moneyDropAccount.ID,
    DestinationAccountID: &creatorAccount.ID,
    Type:            "money_drop_refund",
    Category:        "Money Drop",
    Status:          "completed",
    Amount:          amount,
    Fee:             0,
    Description:     fmt.Sprintf("Refund for Money Drop #%s", dropID.String()),
}

s.repo.CreateTransaction(ctx, refundTx)
```

**Key Difference**: Refunds use **Book Transfer** from money drop account back to primary account, ensuring funds are physically moved back in Anchor.

---

## Database Schema and State Management

### Tables Involved

1. **accounts**
   - `id` (UUID, PK)
   - `user_id` (UUID, FK to users)
   - `anchor_account_id` (String, **nullable for money_drop accounts**)
   - `virtual_nuban` (String, **nullable for money_drop accounts**)
   - `account_type` ('primary' | 'money_drop')
   - `balance` (BigInt, in kobo)
   - `status` ('active' | 'inactive')
   - **Constraints**:
     - Each user has exactly one `primary` account (NOT NULL anchor_account_id)
     - Each user has exactly one `money_drop` account (nullable anchor_account_id until first use)
     - `anchor_account_id` is UNIQUE when NOT NULL (allows multiple NULL values)
     - Partial unique index: `(user_id, account_type)` WHERE `account_type = 'money_drop'`

2. **money_drops**
   - `id` (UUID, PK)
   - `creator_id` (UUID, FK to users)
   - `status` ('active' | 'expired_and_refunded')
   - `amount_per_claim` (BigInt, in kobo)
   - `total_claims_allowed` (Integer)
   - `claims_made_count` (Integer)
   - `expiry_timestamp` (Timestamp)
   - `funding_source_account_id` (UUID, FK to accounts)
   - `money_drop_account_id` (UUID, FK to accounts)
   - `created_at` (Timestamp)

3. **money_drop_claims**
   - `id` (UUID, PK)
   - `drop_id` (UUID, FK to money_drops)
   - `claimant_id` (UUID, FK to users)
   - `claimed_at` (Timestamp)
   - **Unique Constraint**: `(drop_id, claimant_id)` - prevents duplicate claims

4. **transactions**
   - Records all funding, claim, and refund transactions
   - Types: `'money_drop_funding'`, `'money_drop_claim'`, `'money_drop_refund'`

### State Transitions

**Money Drop Lifecycle**:

1. **Created**: Status = `'active'`, `claims_made_count = 0`
2. **Claims Made**: `claims_made_count` increments (1, 2, ..., up to `total_claims_allowed`)
3. **Fully Claimed**: `claims_made_count >= total_claims_allowed` → Scheduler processes
4. **Expired**: `expiry_timestamp <= NOW()` → Scheduler processes
5. **Refunded**: Status = `'expired_and_refunded'`, remaining balance credited to creator

---

## Error Handling and Edge Cases

### Creation Errors

1. **Insufficient Funds**:
   - Frontend: Validates balance before API call
   - Backend: Double-checks against Anchor balance
   - Returns: `400 Bad Request` with message "insufficient funds in primary wallet"

2. **Invalid Input**:
   - Frontend: Validates before submission
   - Backend: Re-validates (defense in depth)
   - Returns: `400 Bad Request` with specific validation error

3. **Database Failure**:
   - If drop creation fails after debit: Funds are refunded automatically
   - Returns: `500 Internal Server Error`

### Claim Errors

1. **Already Claimed**:
   - Checked in atomic transaction
   - Returns: `400 Bad Request` with "you have already claimed this money drop"

2. **Creator Claims Own Drop**:
   - Validated before processing
   - Returns: `400 Bad Request` with "you cannot claim your own money drop"

3. **Drop Not Active**:
   - Status check in atomic transaction
   - Returns: `400 Bad Request` with "money drop is not active"

4. **Drop Expired**:
   - Timestamp check in atomic transaction
   - Returns: `400 Bad Request` with "money drop has expired"

5. **Drop Fully Claimed**:
   - Count check in atomic transaction
   - Returns: `400 Bad Request` with "money drop has been fully claimed"

6. **Anchor Transfer Failure**:
   - Claim is recorded in database
   - Error is logged
   - Transaction status remains 'pending'
   - Webhook handler updates status when Anchor responds

### Race Conditions

- **Concurrent Claims**: Prevented by `FOR UPDATE` row lock in atomic transaction
- **Double Claims**: Prevented by unique constraint on `(drop_id, claimant_id)`
- **Expiry During Claim**: Handled by timestamp check in locked transaction

---

## Summary of Complete Flow

### Creation Flow:

1. User inputs → Frontend validation → Security check
2. API request → Backend handler → Service layer
3. Balance sync → Fund validation (including fee) → **Account-service call (lazy creation)** → Get/create money drop Anchor account
4. **Debit wallet** (total + fee) → **Collect fee** (if fee > 0) → **Book Transfer** (primary → money drop account) → Update database balances
5. Create drop record → Log transaction (with fee) → Return response
6. Display QR code → Share link

**Key Changes**:

- Money drop accounts have **separate Anchor accounts** (not shared with primary)
- Funds are **physically moved** via Book Transfer (not just ledger entries)
- Account creation happens **lazily** (only on first money drop)
- **Fee is charged on creation** (configurable via `MONEY_DROP_FEE_KOBO` env var)
- Fee is deducted from creator's primary account and transferred to admin account

**Fee Handling**:

- Fee is deducted from creator's primary account balance
- Fee is transferred to admin account via Anchor Book Transfer
- Fee is logged in database transaction record (`fee` column)
- Default fee: `0` (no fee charged unless configured)

### Claiming Flow:

1. Access link/QR → Fetch details → Validate claimability
2. User initiates claim → API request → Handler processing
3. Atomic claim transaction → Update counters → Record claim
4. **Book Transfer** (money drop account → claimant primary account) → Log transaction → Return success
5. Update UI → Show success → Invalidate cache

**Key Changes**:

- Funds transferred from **money drop account** (not creator's primary)
- Uses **Book Transfer** (internal Anchor-to-Anchor, no rerouting)
- Ensures true fund separation

### Expiry Flow:

1. Scheduler runs every 5 minutes
2. Finds expired/completed drops
3. Calculates remaining balance
4. **Book Transfer** (money drop account → creator primary account) → Refunds to creator
5. Updates status to 'expired_and_refunded'

**Key Changes**:

- Refunds use **Book Transfer** to physically move funds back
- Funds moved from **money drop account** to **creator's primary account**
- Database balances updated for consistency

All operations are transactional, validated, and include comprehensive error handling to ensure data integrity and user experience.

---

## Architecture Summary

### Money Drop Account Architecture

**Key Design Decisions**:

1. **Separate Anchor Accounts**: Each user has a dedicated Anchor deposit account exclusively for money drops
   - Primary account: Used for regular transactions (P2P, self-transfers, etc.)
   - Money drop account: Used ONLY for money drop operations (funding, claims, refunds)
   - **Physical Fund Separation**: Funds are physically moved between accounts, not just tracked in database

2. **Lazy Account Creation**: Money drop Anchor accounts are created on-demand
   - **First money drop**: Account-service called → Anchor account created → Funds transferred
   - **Subsequent drops**: Existing account reused → Faster operation
   - **Benefits**: Only creates accounts for active users, saves resources

3. **Book Transfer Operations**: All money drop operations use Anchor Book Transfers
   - **Funding**: Primary → Money Drop Account
   - **Claims**: Money Drop Account → Claimant Primary Account
   - **Refunds**: Money Drop Account → Creator Primary Account
   - **No Rerouting**: Book Transfers are internal Anchor-to-Anchor transfers (no external routing)

### Service Interactions

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│ Transaction-   │         │ Account-Service  │         │   Anchor    │
│ Service         │────────▶│                  │────────▶│   BaaS      │
│                 │         │                  │         │             │
│ - Create Drop   │         │ - Create Money   │         │ - Create    │
│ - Claim Drop    │         │   Drop Account   │         │   Account   │
│ - Refund Drop   │         │                  │         │ - Book      │
│                 │         │                  │         │   Transfer  │
└─────────────────┘         └──────────────────┘         └─────────────┘
       │                                                          │
       │                                                          │
       ▼                                                          ▼
┌─────────────────┐                                    ┌─────────────┐
│   Database      │                                    │  Supabase   │
│                 │                                    │             │
│ - accounts      │                                    │ - All       │
│ - money_drops   │                                    │   Tables    │
│ - transactions  │                                    │             │
└─────────────────┘                                    └─────────────┘
```

### Flow Comparison: Old vs New

**OLD (Ledger Account - Not Implemented)**:

- Money drop account reused primary's Anchor account ID
- Funds tracked only in database (not physically moved)
- Database constraint issues (UNIQUE anchor_account_id)
- No true fund separation

**NEW (Separate Anchor Account - Current)**:

- Money drop account has its own Anchor account ID
- Funds physically moved via Book Transfers
- No database constraint issues
- True fund separation in Anchor
- Better audit trail and compliance

### Environment Variables Required

#### Transaction-Service

1. **`MONEY_DROP_FEE_KOBO`** (Optional)
   - **Description**: Fee charged when creating a money drop, in kobo (smallest currency unit)
   - **Example**: `1000` = ₦10.00 fee per money drop creation
   - **Default**: `0` (no fee)
   - **Alternative Variables** (for convenience):
     - `MONEY_DROP_FEE`: Fee in whole currency units (e.g., `10` = ₦10.00)
     - `MONEY_DROP_FEE_NAIRA`: Same as `MONEY_DROP_FEE` (alias)
   - **Location**: `transfa-backend/transaction-service/internal/config/config.go`
   - **Usage**: Fee is deducted from creator's primary account and transferred to admin account on creation

2. **`ADMIN_ACCOUNT_ID`** (Required for fee collection)
   - **Description**: Anchor account ID where money drop fees are collected
   - **Example**: `"17568857819889-anc_acc"`
   - **Usage**: Fee collection will be skipped if not configured

3. **`ACCOUNT_SERVICE_URL`**
   - **Description**: URL of account-service for creating money drop Anchor accounts
   - **Example**: `http://account-service:8080`
   - **Usage**: Used for lazy creation of money drop Anchor accounts

#### Account-Service

1. **`ANCHOR_API_BASE_URL`**
   - **Description**: Anchor BaaS API base URL
   - **Usage**: Required for creating Anchor deposit accounts

2. **`ANCHOR_API_KEY`**
   - **Description**: Anchor BaaS API key
   - **Usage**: Required for authenticating with Anchor API

3. **`DATABASE_URL`**
   - **Description**: PostgreSQL connection string
   - **Usage**: Required for storing account records
