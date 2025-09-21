# Anchor Platform Documentation

## 1. Introduction & Overview

Welcome to Anchor. This documentation provides a comprehensive guide for developers integrating Anchor's APIs into their applications. Our API is REST-based and follows the JSON:API specification. This guide will walk you through everything from the basics, like authentication and request structure, to creating and managing financial products such as accounts and transfers.

### 1.1. API Environments

Our APIs are available in two environments: Sandbox for testing and Live for production. The sandbox environment functions exactly like the live environment, allowing you to test and simulate all activities, from customer and account creation to payments and transfers, without using real money. The Live environment is for transacting with real money.

| Environment | URL                                 |
| ----------- | ----------------------------------- |
| Sandbox     | `https://api.sandbox.getanchor.co/` |
| Live        | `https://api.getanchor.co/`         |

## 2. Getting Started: Developer Onboarding

This section provides a step-by-step guide to get you started with Anchor.

### 2.1. Sign Up for an Anchor Account

1.  **Request an Invite**: To start using Anchor, visit [this link](https://docs.getanchor.co/) to request an invite to the Anchor Dashboard.
2.  **Complete Sign-Up**: Once you receive the invite, proceed to the Anchor Sign Up page and complete the process to create your organization's account.

After signing up, you can sign in to the Anchor Dashboard, a centralized platform where you can view and manage all your operations.

### 2.2. Create and Manage Your API Keys

API keys grant you access to interact with our endpoints securely.

**Steps to Create an API Key:**

1.  Log into the [Anchor Dashboard](https://docs.getanchor.co/).
2.  Select **Developers** and click on **API keys** on the left navigation menu.
3.  Click **Create API Key** at the top right of the screen.
4.  Give your API key a **Label** for identification and select an **expiration date**.
5.  Add the **permissions** you want the API key to have and click **Create API Key**.

**Best Practices for Managing API Keys:**

- **Avoid Hardcoding Keys**: Never embed API keys directly in your application's source code. Use environment variables or configuration files.
- **Rotate Keys Periodically**: Change your API keys at regular intervals to prevent potential vulnerabilities.
- **Delete Unneeded Keys**: Regularly review and delete any keys that are no longer in use to minimize your application's potential attack surface.

### 2.3. Create Webhooks to Listen for Events

Webhooks allow you to receive real-time notifications about events that occur within your organization.

**Steps to Create a Webhook from the Dashboard:**

1.  Log in to your Anchor Dashboard.
2.  Navigate to **Settings** >> **Developers** tab.
3.  Click on the **Webhooks** tab and then click the **Add Webhook** button.
4.  **Webhook Information Page**:
    - Enter the `URL` you want webhook events sent to.
    - Provide a `label` for easy identification.
    - Select your `delivery mode`.
    - Enable **Support Included** (optional). When enabled, the full resource related to the event (e.g., the full customer resource for a `customer.created` event) is included in the event payload.
5.  **Add Events Page**:
    - Check the boxes for the events you want to subscribe to.
6.  Click the **Create Webhook** button.

### 2.4. Get Test Funds in Sandbox

You can simulate incoming payments to fund an account in the sandbox environment.

**Steps to Fund an Account in Sandbox:**

1.  In the sandbox environment on the Anchor Dashboard, go to the **Accounts** page, select **Deposit Accounts**, and click the **Simulate Transfer** button.
2.  Fill out the form with your **API Keys**, a `Source Account Name`, and a `Source Account Number` (these can be random values).
3.  Select the **Virtual Account Number** (`Virtual Nuban`) you wish to fund.
4.  Upon submission, the test funds will reflect in the deposit account linked to that Virtual Nuban.

### 2.5. Going Live

This section outlines the steps required to transition from the sandbox to the live environment and start processing real-money transactions.

**1. Complete Your Integration**
Ensure your integration is complete and thoroughly tested in the sandbox environment. Key milestones include:

- Signing in to the Anchor dashboard.
- Creating sandbox API keys.
- Completing API integration and testing.
- Joining our Slack channel for real-time support.

**2. SLA Execution**
Once integration is complete, we will provide a Service Level Agreement (SLA) for your team to review and sign. Our legal team will also countersign this agreement.

**3. Schedule Pre-Go-Live Call**
We will schedule a pre-go-live video call with your team, where you will be required to demo your solution. A business founder must be present on this call. The call will cover:

- **Use Case Assessment**: We'll review your specific use case to ensure our platform is configured to meet your needs.
- **Solution Demo**: You will provide a demo of your integrated solution.
- **Billing Configuration**: We'll review how fees are configured (charged to your master account or passed to customers).
- **Compliance Review**: We'll discuss compliance requirements to ensure your operations align with regulatory standards.
- Depending on your use case, we may require additional Know-Your-Business (KYB) information.

**4. KYB Approval and Going Live**
After the pre-go-live call, your KYB documents will be reviewed and approved. Once approved, your organization will be moved to the live environment.

- You will get access to transact with real money.
- You will need to create live API keys.
- A root account, the **Master Account**, will be automatically created. It is recommended to keep this account funded at all times to cover transaction fees.

**How long does it take to go live?**
It varies. We have seen organizations go live in 24 hours after integration. However, if additional documentation is required depending on the business registration, the process might take longer.

## 3. Core Concepts & Guides

### 3.1. Customers

Customers represent the individuals or businesses for whom you create financial products.

#### 3.1.1. Individual Customers

An Individual Customer resource stores details like name, address, and contact information for an end-user.

**Resource Fields:**

| Field           | Type        | Description                                                 |
| --------------- | ----------- | ----------------------------------------------------------- |
| `id`            | string      | The unique identifier for the individual customer resource. |
| `type`          | string      | The resource type, which is `IndividualCustomer`.           |
| `attributes`    | JSON Object | A JSON object representing the customer's data.             |
| `relationships` | JSON Object | Describes relationships with other resources on Anchor.     |

**Creating an Individual Customer**

To create a customer, make a `POST` request to the `/api/v1/customers` endpoint. The minimum requirements are the customer's full name, address, email, and phone number. To create a deposit account for the customer, additional KYC information (BVN, date of birth, gender) is required.

**Example: Create Customer with Minimum Requirements**

```shell
curl --location 'https://api.sandbox.getanchor.co/api/v1/customers' \
--header 'Content-Type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data-raw '{
    "data": {
        "type": "IndividualCustomer",
        "attributes": {
            "fullName": {
                "firstName": "John",
                "lastName": "Smith",
                "middleName": "Edem",
                "maidenName": "joy"
            },
            "address": {
                "addressLine_1": "1, Ikeja Village Street",
                "addressLine_2": "1, Ikeja Village Street",
                "city": "Ikeja",
                "state": "Lagos",
                "postalCode": "123456",
                "country": "NG"
            },
            "email": "John@email.com",
            "phoneNumber": "07061234507",
            "metadata": {
                "my_customerID": "12345"
            }
        }
    }
}'
```

#### 3.1.2. Individual Customer KYC

**KYC Tiers:**

- **Tier 0 (Default)**: Requires full name, address, email, and phone number.
- **Tier 1**: Upgrade by providing BVN, date of birth, and gender. The name and phone number must match the details on the BVN. Validation is automatic.
- **Tier 2**: Requires manual review of documents like a Driver's License, Voter's Card, International Passport, NIN slip, or National ID.

**Upgrading a Customer to Tier 1**

To upgrade a customer or validate their KYC information, make a `POST` request to `/api/v1/customers/{customerId}/verification/individual`.

**Example Request:**

```shell
curl --request POST \
     --url https://api.sandbox.getanchor.co/api/v1/customers/169633499900424-anc_ind_cst/verification/individual \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --header 'x-anchor-key: <API Key>' \
     --data '
{
  "data": {
    "type": "Verification",
    "attributes": {
      "level": "TIER_2",
      "level2": {
        "bvn": "22222222200",
        "dateOfBirth": "1996-03-20",
        "gender": "Female"
      }
    }
  }
}'
```

**KYC Webhook Events:**

- `customer.identification.approved`: Sent when KYC is successfully validated.
- `customer.identification.error`: Sent if there is an error or timeout. You should retry later.
- `customer.identification.rejected`: Sent when KYC is rejected. Update the customer information and re-trigger the validation.

#### 3.1.3. Business Customers

A Business Customer resource contains information about a business, including its name, industry, registration details, contact information, and business officers.

**Supported Business Types:**
`Cooperative_Society`, `Private_Incorporated`, `Incorporated_Trustees`, `Business_Name`, `Free_Zone`, `Gov`, `Private_Incorporated_Gov`, `Public_Incorporated`.

**Useful Endpoints for Business Creation:**

| Description             | Endpoint                                      |
| ----------------------- | --------------------------------------------- |
| Get all countries       | `{{baseUrl}}/api/v1/countries`                |
| Find by country code    | `{{baseUrl}}/api/v1/countries?countryCode=NG` |
| Get states in a country | `{{baseUrl}}/api/v1/countries/NG/states`      |

**Creating a Business Customer:**

The process involves three steps:

1.  Send a `POST` request to `/api/v1/customers` to create the business customer.
2.  Trigger the KYB process.
3.  Upload the required documents.

**Example: Create Business Customer Request**

```shell
curl --request POST \
     --url https://api.sandbox.getanchor.co/api/v1/customers \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --header 'x-anchor-key: <API Key>' \
     --data '
{
  "data": {
    "type": "BusinessCustomer",
    "attributes": {
      "basicDetail": {
        "businessName": "Accelerated Echo Limited",
        "registrationType": "Private_Incorporated",
        "country": "NG",
        "dateOfRegistration": "1999-06-25",
        "businessBvn": "12345678901"
      },
      "contact": {
        "email": { "general": "great@example.com" },
        "address": { "main": { "country": "NG", "state": "LAGOS", "city": "Ikeja" } },
        "phoneNumber": "07012345678"
      },
      "officers": [
        {
          "role": "DIRECTOR",
          "fullName": { "firstName": "Josh", "lastName": "Steve" },
          "dateOfBirth": "1994-06-25",
          "email": "director@example.com",
          "phoneNumber": "07012345678",
          "bvn": "22222222226"
        },
        {
          "role": "OWNER",
          "fullName": { "firstName": "Graham", "lastName": "Bell" },
          "dateOfBirth": "2000-06-25",
          "email": "owner@example.com",
          "phoneNumber": "07012345678",
          "bvn": "22222222016",
          "percentageOwned": 100
        }
      ]
    }
  }
}'
```

#### 3.1.4. Business Customer KYB

**1. Trigger KYB**
After creating the business customer, make a `POST` request to `/api/v1/customers/{customerId}/verification/business` to initiate the KYB process.

**2. Receive Document Requirements**
You will receive a `customer.identification.awaitingDocument` webhook event listing the required documents. Alternatively, you can fetch the list of required documents via a `GET` request to `/api/v1/documents/{customerId}`.

**3. Upload Documents**
Upload the requested documents via the Anchor Dashboard or the API. To use the API, make a `POST` request to `/api/v1/documents/upload-document/{customerId}/{documentId}` with a `Content-Type` of `multipart/form-data`.

**KYB Webhook Events:**

- `document.approved` / `document.rejected`: Sent for each document that is reviewed.
- `customer.identification.approved`: Sent when all documents are approved and the KYB process is complete.

### 3.2. Accounts

#### 3.2.1. Deposit Accounts

Deposit accounts are full-fledged bank accounts for your customers that can hold funds. To create a deposit account, the customer must have completed KYC/KYB.

**Root Accounts for Your Organization:**

- **Master Account**: Your main business account for disbursements, collections, and fees.
- **Revenue Account**: Credited with your company's revenues and commissions.
- **FBO (For Benefit Of) Account**: Holds your customer funds and serves as the parent account for sub-accounts.

**Deposit Account Products:**

- **SAVINGS**: For individual customers.
- **CURRENT**: For business customers.

**Creating a Deposit Account**
Make a `POST` request to `/api/v1/accounts`, specifying the `productName` and the customer `id` and `type`.

**Example: Create a Savings Account for an Individual**

```shell
curl --request POST \
     --url https://api.sandbox.getanchor.co/api/v1/accounts \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --header 'x-anchor-key: <API Key>' \
     --data '
{
  "data": {
    "type": "DepositAccount",
    "attributes": {
      "productName": "SAVINGS"
    },
    "relationships": {
      "customer": {
        "data": {
          "id": "16968486366112-anc_ind_cst",
          "type": "IndividualCustomer"
        }
      }
    }
  }
}'
```

> **Note**: The `accountNumber` in the response is masked. To fund the account, use the Virtual Account Number (Virtual NUBAN) linked to it.

#### 3.2.2. Account Numbers (Virtual NUBANs)

Account numbers are pointers to an underlying deposit account. You can create multiple account numbers that all point to the same deposit account. This is useful for tracking payments from different sources.

**Fetching an Account Number**

You can retrieve the account number for a deposit account in two ways:

1.  Make a `GET` request to `/api/v1/account-number` and filter by the `settlementAccountId`.
2.  Make a `GET` request to `/api/v1/accounts/{accountId}?include=AccountNumber` to expand the relationship in a single call.

**Funding a Deposit Account**
To fund a deposit account in the live environment, simply perform a bank transfer to the 10-digit account number linked to it. When funds are received, an `InboundNIPTransfer` resource is created.

**Webhook Events for Incoming Transfers:**

- `nip.inbound.received`: Sent when a bank transfer is pending.
- `nip.inbound.completed`: Sent when the funds have settled in the deposit account.

#### 3.2.3. Reserved Accounts

Reserved Accounts allow you to create permanent virtual account numbers for your customers, simplifying payment collection and reconciliation.

- **Supported Banks**: 9 Payment Service Bank and Providus Bank.
- **Account Name Format**: `Merchant Name / Customer Name`.
- **Limit**: By default, you can create up to 1000 reserved accounts. This can be increased by contacting support.

**Creating a Reserved Account**
Make a `POST` request to `{{baseUrl}}/pay/reserved-account`. You can either create the customer and account in a single request or create the customer first and then create the account by referencing the `customerId`.

**Example: Single Request Creation**

```shell
curl --location 'https://payment.getanchor.co/pay/reserved-account' \
--header 'Content-Type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
    "data": {
        "type": "ReservedAccount",
        "attributes": {
            "provider": "ninepsb",
            "customer": {
                "individualCustomer": {
                    "fullName": {
                        "firstName": "Bright",
                        "lastName": "John-Olorunoje"
                    },
                    "email": "email@email.com",
                    "bvn": "22222222226"
                }
            }
        }
    }
}'
```

**Webhook Events for Reserved Accounts:**

- `reservedAccount.created`: Sent on successful creation.
- `reservedAccount.failed`: Sent if creation fails.
- `payin.received`: Sent when the reserved account receives a bank transfer.

#### 3.2.4. Subledger Accounts (Sub-Accounts)

Subledger accounts are child accounts created under your main FBO deposit account. Each sub-account can have its own unique account number (Virtual NUBAN) and must be tied to a customer. They maintain their own balances and transaction records, and the sum of all sub-account balances will always equal the balance of the parent FBO account.

> **Note**: Subledger functionality is currently available only in the Live Environment.

**Creating a Sub-Account**
Make a `POST` request to `/api/v1/sub-accounts`, providing the customer ID and the parent FBO account ID.

### 3.3. Money Movement

#### 3.3.1. Transfers

Anchor supports two types of transfers for moving money.

- **Book Transfer**: Transfers between accounts within your own organization. These are free of charge.
- **Bank Transfer (NIP Transfer)**: Transfers from your organization to external bank accounts in Nigeria.

**Making a Book Transfer**
Make a `POST` request to `/api/v1/transfers` with `type` set to `BookTransfer`. Specify the source and destination accounts in the `relationships` object. The source and destination can be `DepositAccount` or `SubAccount`.

**Example: Book Transfer**

```shell
curl --request POST \
     --url https://api.sandbox.getanchor.co/api/v1/transfers \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --header 'x-anchor-key: <API Key>' \
     --data '
{
  "data": {
    "type": "BookTransfer",
    "attributes": {
      "currency": "NGN",
      "amount": 500000,
      "reason": "sample transfer",
      "reference": "ref_anchor_12321"
    },
    "relationships": {
      "destinationAccount": {
        "data": {
          "type": "SubAccount",
          "id": "16932376220293-anc_subacc"
        }
      },
      "account": {
        "data": {
          "type": "SubAccount",
          "id": "16932386254124-anc_subacc"
        }
      }
    }
  }
}'
```

**Making a Bank (NIP) Transfer**
To send money to an external bank account, you must first create a `CounterParty` (a saved beneficiary).

**Steps for a NIP Transfer:**

1.  **(Optional) List Banks**: `GET /api/v1/banks` to get a list of supported banks and their codes.
2.  **(Recommended) Verify Account Details**: `GET /api/v1/payments/verify-account/{bankCode}/{accountNumber}` to confirm the recipient's details.
3.  **Create CounterParty**: `POST /api/v1/counterparties` to save the recipient's bank details. You can set `verifyName: true` to verify and create in one step.
4.  **Initiate Transfer**: `POST /api/v1/transfers` with `type` set to `NIPTransfer`. Reference the source account and the created `counterParty` in the `relationships` object.

**Example: Initiate NIP Transfer**

```shell
curl --location 'https://api.sandbox.getanchor.co/api/v1/transfers' \
--header 'Content-Type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
    "data": {
        "type": "NIPTransfer",
        "attributes": {
            "amount": 10000,
            "currency": "NGN",
            "reason": "Sample NIP transfer",
            "reference": "ref_unique_123"
        },
        "relationships": {
            "account": {
                "data": {
                    "id": "166012843397415-anc_acc",
                    "type": "DepositAccount"
                }
            },
            "counterParty": {
                "data": {
                    "id": "16942577770351-anc_cp",
                    "type": "CounterParty"
                }
            }
        }
    }
}'
```

**Verifying Transfer Status**
You can check the status of a transfer by making a `GET` request to `/api/v1/transfers/verify/{transferId}`.

**Transfer Statuses:** `pending`, `completed`, `failed`, `reversed`.

#### 3.3.2. Bulk Transfers

The Bulk Transfer API allows you to initiate multiple transfers (Book, NIP, or a combination) in a single API request. You can include up to 100 individual transfers in one bulk request.

**Initiating a Bulk Transfer**
Make a `POST` request to `/api/v1/transfers/bulk` with an array of transfer objects.

**Webhook Events for Bulk Transfers:**

- `bulkTransfer.started`: Sent when the bulk transfer begins processing.
- `bulkTransfer.completed`: Sent when all individual transfers have reached a final state (either successful or failed).
- Webhooks for each individual transfer (`book.transfer.successful`, `nip.transfer.failed`, etc.) are also sent.

### 3.4. Bill Payments

Our Bill Payment API allows you to offer services like airtime purchase, data bundles, TV subscriptions, and electricity payments. You earn a commission on each successful transaction, which is paid in real-time to your revenue account.

- **Commissions**: 2% on Airtime/Data, 1% on electricity, and up to 1.5% on cable TV.

#### 3.4.1. Data Purchase

1.  **List Data Providers**: `GET /api/v1/bills/billers?category=data`
2.  **List Provider's Products**: `GET /api/v1/bills/billers/{billerId}/products` to get available data plans and their `productSlug` and `price`.
3.  **Initiate Payment**: `POST /api/v1/bills` with `type` set to `Data`, providing the `phoneNumber`, `amount`, `productSlug`, and source account.

#### 3.4.2. Airtime Purchase

1.  **List Airtime Providers**: `GET /api/v1/bills/billers?category=airtime`
2.  **List Provider's Products**: `GET /api/v1/bills/billers/{billerId}/products`
3.  **Initiate Payment**: `POST /api/v1/bills` with `type` set to `Airtime`, providing the `provider`, `phoneNumber`, `amount`, and source account.

#### 3.4.3. Electricity Purchase

1.  **List Electricity Providers**: `GET /api/v1/bills/billers?category=electricity`
2.  **List Provider's Products**: `GET /api/v1/bills/billers/{billerId}/products`
3.  **Validate Meter Number**: `GET /api/v1/bills/customer-validation/{productSlug}/{meterAccountNumber}` to verify the customer's details.
4.  **Initiate Payment**: `POST /api/v1/bills` with `type` set to `Electricity`, providing the `meterAccountNumber`, `phoneNumber`, `productSlug`, `amount`, and source account.

**Webhook Events for Bill Payments**: `bills.initiated`, `bills.successful`, `bills.failed`.

## 4. API Reference & Conventions

### 4.1. General Principles

- **JSON:API Specification**: Anchor's API adheres to the JSON:API specification. All requests and responses are structured as JSON documents with a top-level `data` or `errors` member.
- **Authentication**: All API requests must be authenticated via API keys sent in the `x-anchor-key` header.
- **Data Types**:
  - **Amount**: Integers in the smallest currency unit (e.g., `10000` for NGN 100.00).
  - **Currency Code**: ISO 4217 code (e.g., `NGN`).
  - **Country Code**: ISO 3166 alpha-2 code (e.g., `NG`).
  - **Date**: `YYYY-MM-DD` format.
  - **Datetime**: ISO 8601 format in UTC (e.g., `2021-04-25T17:22:18+0000`).
- **Errors**: Standard HTTP response codes are used. 2xx for success, 4xx for client errors, and 5xx for server errors. Error responses contain a detailed JSON body.
- **Pagination**: Endpoints that list resources support pagination via `page[number]` and `page[size]` query parameters.
- **Idempotency**: `POST` requests to `Transfers`, `VirtualNubans`, and `BulkTransfer` endpoints support idempotency. Include an `x-anchor-idempotent-key` header with a unique string to safely retry requests. Keys are effective for 24 hours.
- **Metadata**: Most resources support a `metadata` object (key-value pairs) for storing custom information. You can query `GET` endpoints using metadata tags.
- **Fetching Related Resources**: Use the `include` query parameter on `GET` requests to retrieve related resources in a single call (e.g., `?include=customer,account`). The related resources will be returned in an `included` array in the response.

### 4.2. Webhooks

Webhooks are used to notify your application of events.

- **Configuration**: Must be `https` URLs that accept `POST` requests with JSON payloads.
- **Security**: You can specify a secret token when creating a webhook. We will use this token to generate a signature and send it in the `x-anchor-signature` header. The signature is calculated as `Base64(HMAC_SHA1(request_body, secret_token))`.
- **Delivery Modes**:
  - `AtMostOnce`: The event is sent once. If delivery fails, it is not retried.
  - `AtLeastOnce`: If delivery fails, we will retry up to 5 times. We have a delivery backoff policy of 26 times before stopping.
- **IP Addresses**: Webhooks are sent from the IP address `18.133.55.102`.

## 5. Need Help?

- Visit our [API references](https://docs.getanchor.co/reference/overview).
- For real-time support during integration, join our [Slack workspace](https://docs.getanchor.co/).

---

## Appendix: Event Types Guide

The following is a list of event types that we currently capture and send. Please note that this list may not be exhaustive, as we are constantly adding new event types.

| Event                                         | Description                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `customer.created`                            | Generated when a new customer account is successfully created in your organization.                                 |
| `customer.updated`                            | Generated when an existing customer account is successfully updated or modified.                                    |
| `customer.identification.approved`            | Generated when a Customer's KYC is approved.                                                                        |
| `customer.identification.rejected`            | Generated when a Customer's KYC is rejected.                                                                        |
| `customer.identification.manualReview`        | Generated when a Customer's KYC is pending manual review.                                                           |
| `customer.identification.error`               | Generated when a Customer's KYC fails due to an error.                                                              |
| `customer.identification.reenter_information` | Generated when a Customer's KYC information needs to be re-entered.                                                 |
| `customer.identification.awaitingDocument`    | Generated when a Customer's KYC requires a document to be submitted.                                                |
| `document.approved`                           | Generated when a submitted document is approved.                                                                    |
| `document.rejected`                           | Generated when a submitted document is rejected.                                                                    |
| `account.opened`                              | Generated when a new account is successfully created.                                                               |
| `account.closed`                              | Generated when an account is successfully closed.                                                                   |
| `account.frozen`                              | Generated when an account is frozen, usually due to suspicious activity or compliance issues.                       |
| `account.unfrozen`                            | Generated when a previously frozen account is unfrozen and can be used again.                                       |
| `account.creation.failed`                     | Generated when there is a failure in creating a general account.                                                    |
| `sub_account.created`                         | Generated when a sub-account is created.                                                                            |
| `virtualNuban.created`                        | Generated when a Virtual Account is successfully created.                                                           |
| `virtualNuban.closed`                         | Generated when a Virtual Account is successfully closed or deactivated.                                             |
| `virtualNuban.creation.failed`                | Generated when there is a failure in creating a Virtual Account.                                                    |
| `payment.received`                            | Generated when payment is received into a Virtual Account Number.                                                   |
| `payment.settled`                             | Generated when payment received into a virtual account number is settled into the linked deposit account.           |
| `book.transfer.initiated`                     | Generated when the process of initiating a book transfer is started.                                                |
| `book.transfer.successful`                    | Generated when a Book Transfer is successful.                                                                       |
| `book.transfer.failed`                        | Generated when a book transfer fails for any reason (rare).                                                         |
| `nip.transfer.initiated`                      | Generated when a NIP Transfer is initiated.                                                                         |
| `nip.transfer.successful`                     | Generated when a NIP Transfer is successful.                                                                        |
| `nip.transfer.failed`                         | Generated when a NIP Transfer fails.                                                                                |
| `nip.transfer.reversed`                       | Generated when a NIP Transfer is reversed.                                                                          |
| `nip.incomingTransfer.received`               | Generated when an incoming NIP transfer is received.                                                                |
| `bulkTransfer.started`                        | Generated when a Bulk Transfer has started processing after validation.                                             |
| `bulkTransfer.completed`                      | Generated when a Bulk Transfer is completed (all individual transfers have a final status).                         |
| `bulkTransfer.partiallyCompleted`             | Generated when a Bulk Transfer is partially completed (some transfers are still being re-queried).                  |
| `bulkTransfer.failed`                         | Generated when a Bulk Transfer fails.                                                                               |
| `bills.initiated`                             | Generated when a bill payment is initiated.                                                                         |
| `bills.successful`                            | Generated when a bill payment is successful.                                                                        |
| `bills.failed`                                | Generated when a bill payment fails.                                                                                |
| `ach.initiated`                               | Generated when an ACH Transfer is initiated.                                                                        |
| `ach.pending_submission`                      | Generated when an ACH Transfer is pending submission.                                                               |
| `ach.manual_review`                           | Generated when an ACH Transfer is being reviewed.                                                                   |
| `ach.submitted`                               | Generated when an ACH Transfer has been submitted to the federal reserve.                                           |
| `ach.settled`                                 | Generated when an ACH Transfer has been settled.                                                                    |
| `ach.completed`                               | Generated when an ACH Transfer has been completed.                                                                  |
| `ach.cancelled`                               | Generated when an ACH Transfer has been cancelled.                                                                  |
| `ach.failed`                                  | Generated when an ACH Transfer has failed.                                                                          |
| `ach.returned`                                | Generated when an ACH Transfer has been returned.                                                                   |
| `ach.pending_cancellation`                    | Generated when an ACH Transfer is pending cancellation.                                                             |
| `domestic.wire.initiated`                     | Generated when a Domestic Wire Transfer is initiated.                                                               |
| `domestic.wire.rejected`                      | Generated when a Domestic Wire Transfer is rejected.                                                                |
| `domestic.wire.submitted`                     | Generated when a Domestic Wire Transfer has been submitted to the federal reserve.                                  |
| `domestic.wire.completed`                     | Generated when a Domestic Wire Transfer has been completed.                                                         |
| `domestic.wire.failed`                        | Generated when a Domestic Wire Transfer has failed.                                                                 |
| `domestic.wire.manual_review`                 | Generated when a Domestic Wire Transfer is being reviewed.                                                          |
| `domestic.wire.pending_submission`            | Generated when a Domestic Wire Transfer is pending submission to the federal reserve.                               |
| `international.wire.initiated`                | Generated when an International Wire Transfer is initiated.                                                         |
| `international.wire.completed`                | Generated when an International Wire Transfer has been completed.                                                   |
| `international.wire.failed`                   | Generated when an International Wire Transfer has failed.                                                           |
| `international.wire.manual-review`            | Generated when an International Wire Transfer is being reviewed.                                                    |
| `international.wire.rejected`                 | Generated when an International Wire Transfer is rejected by the SWIFT network, correspondent, or beneficiary bank. |
| `international.wire.submitted`                | Generated when an International Wire Transfer has been submitted to the SWIFT network.                              |
| `international.wire.pending_submission`       | Generated when an International Wire Transfer is pending submission to the SWIFT network.                           |
| `balance_summary.reporting.initiated`         | Generated when a balance summary report is initiated.                                                               |
| `balance_summary.reporting.scheduled`         | Generated when a balance summary report is scheduled.                                                               |
| `balance_summary.reporting.completed`         | Generated when a balance summary report is completed.                                                               |
| `balance_summary.reporting.failed`            | Generated when a balance summary report fails.                                                                      |
| `transaction_history.reporting.initiated`     | Generated when a transaction history report is initiated.                                                           |
| `transaction_history.reporting.scheduled`     | Generated when a transaction history report is scheduled.                                                           |
| `transaction_history.reporting.completed`     | Generated when a transaction history report is completed.                                                           |
| `transaction_history.reporting.failed`        | Generated when a transaction history report fails.                                                                  |
| `statement.initiated`                         | Generated when a statement report is initiated.                                                                     |
| `statement.scheduled`                         | Generated when a statement report is scheduled.                                                                     |
| `statement.completed`                         | Generated when a statement report is completed.                                                                     |
| `statement.failed`                            | Generated when a statement report fails.                                                                            |
