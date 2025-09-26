# Anchor Documentation

**Source**: https://docs.getanchor.co/  
**Last Updated**: 2025-08-21

---

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
  - [Developer Onboarding](#developer-onboarding)
  - [Authentication](#authentication)
  - [API Keys](#api-keys)
  - [Webhooks](#webhooks)
  - [Environments](#environments)
- [Customer Management](#customer-management)
  - [Individual Customers](#individual-customers)
  - [Business Customers](#business-customers)
  - [KYC/KYB Process](#kyc-kyb-process)
- [Account Management](#account-management)
  - [Deposit Accounts](#deposit-accounts)
  - [Account Numbers](#account-numbers)
  - [Reserved Accounts](#reserved-accounts)
- [Transfers](#transfers)
  - [Book Transfers](#book-transfers)
  - [Bank Transfers (NIP)](#bank-transfers-nip)
- [API Reference](#api-reference)
- [Support](#support)

---

## Overview

Anchor's API is REST-based and follows the [JSON:API specification](https://jsonapi.org/). This documentation guides you from the basics (authentication, request structure) to how clients should use and create financial products (accounts, transfers, etc.).

### What You'll Need

- Dashboard account ([sign in here](https://app.getanchor.co/), or [request an invite](https://app.getanchor.co/invite) to get started)
- API key
- API documentation
- Postman or similar tool to test APIs

> **📘 Ready to get started?**  
> Before you begin, you'll need to sign up for an Anchor account to receive immediate access to our Sandbox and start building.

---

## Getting Started

### Developer Onboarding

Integrating Anchor APIs in your applications requires several key steps:

#### 1. Sign Up on Anchor

To start using Anchor:

1. Visit [this link](https://app.getanchor.co/invite) to request an invite to the Anchor Dashboard
2. Once you receive the invite, proceed to the Anchor Sign Up page
3. Complete the sign-up process to create your organization account

After signing up, you'll be able to sign in and access the Anchor Dashboard, a centralized platform where you can view and manage all your operations within Anchor.

#### 2. API Environments

Our APIs are available in two environments:

| Environment | URL                                 |
| ----------- | ----------------------------------- |
| **Sandbox** | `https://api.sandbox.getanchor.co/` |
| **Live**    | `https://api.getanchor.co/`         |

- **Sandbox Environment**: Works just like the live environment and contains API operations that allow you to easily test and simulate different activities, from customer and deposit account creation to incoming payments or transfers.
- **Live Environment**: Allows you to transact with real money.

#### 3. API Keys

API keys give you access to interact with and call our endpoints. They are essential for securely interacting with Anchor's API services.

**How to Create API Keys:**

1. Log into the [Anchor Dashboard](https://app.getanchor.co/)
2. Select **Developers** and click on **API keys** in the left navigation menu
3. Click **Create API Key** at the top right of the screen
4. Give your API key a **Label** for identification and select an **expiration date**
5. Add the **permissions** you want your API keys to have
6. Click **Create API Key** at the bottom right to create it

**Best Practices for API Keys:**

- **Avoid Hardcoding**: Never embed API keys directly in your application's source code. Use environment variables or configuration files outside your source tree.
- **Change Periodically**: Change your API keys at regular intervals, even if they're still in use.
- **Regular Review**: Periodically review and delete any keys that are no longer needed.

#### 4. Webhooks

You can quickly create webhooks from your dashboard to listen to specific events that happen within your organization.

**Creating Webhooks:**

1. Log in to your Anchor Dashboard
2. Click on **Settings** → Click on the **Developers** tab
3. Click on the **Webhooks** tab → Click on the **Add Webhook** button

**On the Webhook Information Page:** 4. Enter the URL you want your webhook to be sent to 5. Give your webhook a label (helps identify it if you create multiple webhooks) 6. Select your delivery mode 7. Choose whether to enable **Support Included** (default: false). When enabled, every webhook related to a specific resource will include the full resource in the payload.

**On the Add Events Page:** 8. Check the boxes for the types of events you want to include 9. Click the **Create Webhook** button

#### 5. Sandbox Testing

To get test funds in sandbox, use the simulate transfer button in the dashboard:

1. In the sandbox environment, go to the Accounts page, select Deposit Accounts
2. Click on the **Simulate Transfer** button
3. Fill out the form with your API Keys, Source Account Name, and Source Account Number
4. Select the Virtual Account Number (Virtual NUBAN) you want to fund
5. On submission, the test funds will reflect in the deposit account linked to the Virtual NUBAN

> **Note**: Source Account Name and Source Account Number can be random values for testing purposes.

#### 6. Next Steps

After setting up your development environment:

- To create accounts on Anchor, use our [Account Guide](#create-deposit-account)
- To onboard customers, visit our [Individual Customers](#individual-customers) and/or [Business Customers](#business-customers) guides
- Collect or receive payments with our [Collections Guide](#reserved-accounts)
- Send money (Transfers)? Visit the [Send Money Transfer Guide](#transfers)
- To pay bills, use our [Bill Payment Guide](#bill-payments)
- When you're ready to transact with real money, visit the [Go-Live Guide](#going-live)

---

## Customer Management

### Individual Customers

Individual customers represent people for whom you may create financial products. They are JSON:API resources with the following top-level fields:

| Field           | Type        | Description                                                                                 |
| --------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `id`            | string      | Unique identifier for the individual customer resource (e.g., `16910821827810-anc_ind_cst`) |
| `type`          | string      | Type of the customer resource (`IndividualCustomer`)                                        |
| `attributes`    | JSON Object | JSON object representing the customer data                                                  |
| `relationships` | JSON Object | Describes relationships between the customer resource and other resources on Anchor         |

#### Creating Individual Customers

To create an instance of a customer object, make a POST request to the `/customers` endpoint and provide the required parameters.

**Endpoint:** `POST {{baseUrl}}/api/v1/customers`

**Minimum Requirements:**

- Full Name
- Address
- Email
- Phone number

**Additional KYC Information (for deposit accounts):**

- BVN
- Date of birth
- Gender

You can include metadata as key-value pairs in your request to save additional information in our system.

##### Create Customer with Minimum Requirements

**Request:**

```bash
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

**Response:**

```json
{
  "data": {
    "id": "170116154363520-anc_ind_cst",
    "type": "IndividualCustomer",
    "attributes": {
      "createdAt": "2023-11-28T08:52:23.640935",
      "metadata": {
        "my_customerID": "12345"
      },
      "phoneNumber": "07061234507",
      "address": {
        "addressLine_1": "1, Ikeja Village Street",
        "addressLine_2": "1, Ikeja Village Street",
        "country": "NG",
        "city": "Ikeja",
        "postalCode": "123456",
        "state": "Lagos"
      },
      "soleProprietor": false,
      "fullName": {
        "firstName": "John",
        "lastName": "Smith",
        "middleName": "Edem",
        "maidenName": "joy"
      },
      "email": "John@email.com",
      "verification": {
        "status": "unverified"
      },
      "status": "ACTIVE"
    },
    "relationships": {
      "documents": {
        "data": []
      },
      "organization": {
        "data": {
          "id": "16922119849071-anc_og",
          "type": "Organization"
        }
      }
    }
  }
}
```

##### Create Customer with KYC Level 2 Details

**Request:**

```bash
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
                "maidenName": "Joy"
            },
            "address": {
                "addressLine_1": "1, Ikeja Village Street",
                "addressLine_2": "1, Ikeja Village Street",
                "city": "Ikeja",
                "state": "Lagos",
                "postalCode": "123456",
                "country": "NG"
            },
            "email": "Johns@email.com",
            "phoneNumber": "07061234509",
            "identificationLevel2": {
                "dateOfBirth": "1994-06-25",
                "gender": "Male",
                "bvn": "22222324206"
            },
            "metadata": {
                "my_customerID": "12345"
            }
        }
    }
}'
```

#### Individual Customer KYC

**KYC Tiers:**

| Tier/Level | Description                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| **Tier 0** | Default level. Required: full name, address, email, and phone number                                                |
| **Tier 1** | Upgrade by providing BVN, dateOfBirth, and gender. Name and phone number must match BVN details                     |
| **Tier 2** | Requires manual review of documents (Driver's License, Voter's Card, International Passport, NIN slip, National ID) |

##### Upgrade Customer to Tier 1

**Endpoint:** `POST {{baseUrl}}/api/v1/customers/{customerId}/verification/individual`

**Request:**

```bash
curl --request POST \
--url https://api.sandbox.getanchor.co/api/v1/customers/169633499900424-anc_ind_cst/verification/individual \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
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

**KYC Events:**

- `customer.identification.approved`: KYC successfully validated
- `customer.identification.error`: Error or timeout during validation (retry later)
- `customer.identification.rejected`: KYC rejected (update customer information and retry)

#### Managing Individual Customers

##### Update Customer Name

**Endpoint:** `PUT {{baseUrl}}/api/v1/customers/update/{customerId}`

**Request:**

```json
{
  "data": {
    "type": "IndividualCustomer",
    "attributes": {
      "fullName": {
        "firstName": "JOHN",
        "lastName": "DOE",
        "middleName": "JOHN",
        "maidenName": "PHILIP"
      }
    }
  }
}
```

> **📘 Note**: A customer whose KYC information has been completed cannot be updated.

##### Delete Customer

**Endpoint:** `DELETE {{baseUrl}}/api/v1/customers/{customerId}`

### Business Customers

A business customer resource contains information about the business including:

- Basic details (business name, industry, registration type, date of registration)
- Contact details (emails, main contact address, registered address)
- Business officers' details

**Supported Business Types:**

- Cooperative_Society
- Private_Incorporated
- Incorporated_Trustees
- Business_Name
- Free_Zone
- Gov
- Private_Incorporated_Gov
- Public_Incorporated

#### Creating Business Customers

**Steps:**

1. Send a create business customer request
2. Trigger KYB for the business customer
3. Upload required documents

**Endpoint:** `POST {{baseUrl}}/api/v1/customers`

**Request:**

```bash
curl --request POST \
--url https://api.sandbox.getanchor.co/api/v1/customers \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
  "data": {
    "type": "BusinessCustomer",
    "attributes": {
      "address": {
        "country": "NG",
        "state": "KANO"
      },
      "basicDetail": {
        "industry": "Agriculture-AgriculturalCooperatives",
        "registrationType": "Private_Incorporated",
        "country": "NG",
        "businessName": "Accelerated Echo Limited",
        "businessBvn": "12345678901",
        "dateOfRegistration": "1999-06-25",
        "description": "Accelerated Echo Limited is a digital marketing business that supports consumers directly by proving easy payments to consumer market",
        "website": "https://www.example.com"
      },
      "contact": {
        "email": {
          "general": "great@example.com",
          "support": "support@example.com",
          "dispute": "dispute@example.com"
        },
        "address": {
          "main": {
            "country": "NG",
            "state": "LAGOS",
            "addressLine_2": "1 James street",
            "addressLine_1": "1 James street",
            "city": "Ikeja",
            "postalCode": "100032"
          },
          "registered": {
            "country": "NG",
            "state": "LAGOS",
            "addressLine_1": "1099 Pepple street, Computer Village",
            "addressLine_2": "1099 Pepple street, Computer Village",
            "city": "Ikeja",
            "postalCode": "100032"
          }
        },
        "phoneNumber": "07012345678"
      },
      "officers": [
        {
          "role": "DIRECTOR",
          "fullName": {
            "firstName": "Josh",
            "lastName": "Steve",
            "middleName": "JOHN",
            "maidenName": "PHILIP"
          },
          "nationality": "NG",
          "address": {
            "country": "NG",
            "state": "LAGOS",
            "addressLine_1": "1 James street",
            "addressLine_2": "Onike",
            "city": "Yaba",
            "postalCode": "100032"
          },
          "dateOfBirth": "1994-06-25",
          "email": "exioiple@example.com",
          "phoneNumber": "07012345678",
          "bvn": "22222222226",
          "title": "CEO",
          "percentageOwned": 0
        },
        {
          "role": "OWNER",
          "fullName": {
            "firstName": "Graham",
            "lastName": "Bell",
            "middleName": "JOHN",
            "maidenName": "PHILIP"
          },
          "nationality": "NG",
          "address": {
            "country": "NG",
            "state": "KANO",
            "addressLine_1": "1 James street",
            "addressLine_2": "Onike",
            "city": "Yaba",
            "postalCode": "100032"
          },
          "dateOfBirth": "2000-06-25",
          "email": "example@exampl.com",
          "phoneNumber": "07012345678",
          "bvn": "22222222016",
          "title": "COO",
          "percentageOwned": 100
        }
      ]
    }
  }
}'
```

#### Business Customer KYB

**Trigger KYB:**

**Endpoint:** `POST {{baseUrl}}/api/v1/customers/{customerId}/verification/business`

**Request:**

```bash
curl --request POST \
--url https://api.getanchor.co/api/v1/customers/16968633133013-anc_bus_cst/verification/business \
--header 'accept: application/json' \
--header 'x-anchor-key: <API Key>'
```

**KYB Events:**

- `customer.identification.awaitingDocument`: Sent when documents are required
- `document.approved`: Document approved
- `document.rejected`: Document rejected
- `customer.identification.approved`: All documents reviewed and KYC completed

**Document Upload:**

You can upload documents via:

1. **Dashboard**: Use `app.getanchor.co/document-upload`
2. **API**: `POST {{baseUrl}}/api/v1/documents/upload-document/{customerId}/{documentId}`

**API Upload Example:**

```bash
curl --location --request POST 'https://api.sandbox.getanchor.co/api/v1/documents/upload-document/1709219366100434-anc_bus_cst/1709219967788444-anc_doc' \
--header 'content-type: multipart/form-data; boundary=---' \
--header 'x-anchor-key: <API Key>'
```

#### Managing Business Customers

##### Add Business Officer

**Endpoint:** `POST {{baseUrl}}/api/v1/businesses/:businessId/officers`

**Request:**

```bash
curl --location 'https://api.sandbox.getanchor.co/api/v1/businesses/17085065886691-anc_bus_cst/officers' \
--header 'Content-Type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data-raw '{
    "data": {
        "type": "BusinessOfficer",
        "attributes": {
            "fullName": {
                "firstName": "Otega",
                "lastName": "Doe",
                "middleName": "Smith"
            },
            "role": "OWNER",
            "dateOfBirth": "1990-06-26",
            "email": "test@yahoo.com",
            "phoneNumber": "08123456136",
            "title": "CFO",
            "nationality": "NG",
            "identificationType": "DRIVERS_LICENSE",
            "idDocumentNumber": "3234343433",
            "address": {
                "addressLine_1": "1 Araromi street",
                "addressLine_2": "Lagos Mainland",
                "postalCode": "123456",
                "city": "Mainland",
                "state": "Lagos",
                "country": "NG"
            },
            "bvn": "12345678909",
            "percentageOwned": 50.0
        }
    }
}'
```

**Identification Types:**

- DRIVERS_LICENSE
- VOTERS_CARD
- PASSPORT
- NATIONAL_ID
- NIN_SLIP

##### Update Business Officer

**Endpoint:** `PATCH {{baseUrl}}/api/v1/businesses/:businessId/officers/:officerId`

**Delete Business Officer:**

**Endpoint:** `DELETE {{baseUrl}}/api/v1/businesses/:businessId/officers/:officerId`

---

## Account Management

### Deposit Accounts

Deposit accounts on Anchor represent products that can be issued to customers, allowing them to deposit and withdraw stored funds. From wallets to savings accounts to current accounts, the notion of an account is fundamental.

**Key Points:**

- You can create full-fledged deposit accounts for your customers
- KYC/KYB must be completed before creating deposit accounts
- Deposit accounts represent full-fledged bank accounts that can receive and hold funds
- Root accounts are automatically created when your organization goes live

**Root Account Types:**

- **Master Account**: Main business account used for disbursements and payment collection
- **Revenue Account**: Designed to be credited with company revenues and commission
- **FBO Account**: "For Benefit Of" account designed to hold customer funds

#### Deposit Account Products

| Product     | Description                                                              | Customer Type             |
| ----------- | ------------------------------------------------------------------------ | ------------------------- |
| **SAVINGS** | Designed for individual customers to save and accumulate funds over time | Individual customers only |
| **CURRENT** | Meant for business customers to run day-to-day transactions              | Business customers only   |

#### Creating Deposit Accounts

**Process Flow:**

1. **Onboard Customer**: Create a customer resource using appropriate customer API endpoints
2. **Initiate KYC/KYB**: Trigger KYC or KYB processes for the onboarded customer
3. **Create Deposit Account**: Once KYC/KYB is completed, create a deposit account using the designated API endpoint

**Endpoint:** `POST {{baseUrl}}/api/v1/accounts`

**Required Parameters:**

- `type`: "DepositAccount"
- `productName`: "SAVINGS" for individual customers, "CURRENT" for business customers
- `customer`: Customer object with `id` and `type`

##### Savings Account for Individual Customer

**Request:**

```bash
curl --request POST \
--url https://api.sandbox.getanchor.co/api/v1/accounts \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
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

**Response:**

```json
{
  "data": {
    "id": "16968487149490-anc_acc",
    "type": "DepositAccount",
    "attributes": {
      "createdAt": "2023-10-09T10:51:54.971443",
      "bank": {
        "id": "16565854883910-anc_bk",
        "name": "CORESTEP MICROFINANCE BANK",
        "cbnCode": "",
        "nipCode": "090365"
      },
      "accountName": "OLORUNOJE John IBRAHIM",
      "frozen": false,
      "currency": "NGN",
      "accountNumber": "******3736",
      "type": "SAVINGS",
      "status": "ACTIVE"
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
}
```

##### Current Account for Business Customer

**Request:**

```bash
curl --request POST \
--url https://api.sandbox.getanchor.co/api/v1/accounts \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
  "data": {
    "type": "DepositAccount",
    "attributes": {
      "productName": "CURRENT"
    },
    "relationships": {
      "customer": {
        "data": {
          "id": "16976298908802-anc_bus_cst",
          "type": "BusinessCustomer"
        }
      }
    }
  }
}'
```

> **📘 Important Notes:**
>
> - Account numbers are masked in responses (you don't need them to fund accounts)
> - To fund a deposit account, send money to the Virtual Account Number (Virtual NUBAN) linked to it
> - You'll be notified via webhook `accountNumber.created` when an account number is generated

#### Account Numbers

Account numbers work like pointers to underlying deposit accounts. While traditional banks typically only allow one account number per deposit account, Anchor lets you create multiple account numbers, all referring to the same deposit account.

**Benefits:**

- Generate unique account numbers for different transactions
- Fund bank accounts directly
- No need for manual reconciliation

##### Fetch Account Number

**Option 1: Direct Endpoint**

**Endpoint:** `GET {{baseUrl}}/api/v1/account-number`

**Request:**

```bash
curl --request GET \
--url 'https://api.getanchor.co/api/v1/account-number' \
--header 'accept: application/json' \
--header 'x-anchor-key: <API Key>'
```

**Option 2: Include Feature**

**Endpoint:** `GET {{baseUrl}}/api/v1/accounts/{accountId}?include=AccountNumber`

**Request:**

```bash
curl --request GET \
--url 'https://api.getanchor.co/api/v1/accounts/169925847367121-anc_acc?include=AccountNumber' \
--header 'accept: application/json' \
--header 'x-anchor-key: <API Key>'
```

##### Fund Deposit Account

To fund a deposit account in live/production environment, send money to the 10-digit account number linked to the deposit account via:

- USSD
- Mobile transfer
- Bank transfer at any bank

When an account number receives funds via bank transfer, an `InboundNIPTransfer` resource is created.

**Fetch Inbound Transfer:**

**Endpoint:** `GET {{baseUrl}}/api/v1/inbound-transfers/{inboundTransferId}`

**Sample Response:**

```json
{
  "id": "17377236798920-anc_inb_trsf",
  "type": "InboundNIPTransfer",
  "attributes": {
    "reference": "17129227043986-ref",
    "createdAt": "2025-01-24T13:01:20",
    "amount": 100000,
    "description": "Transfer from James Doe Smith",
    "currency": "NGN",
    "sessionId": "100000000120000044125970509532",
    "sourceAccountNumber": "8166666666",
    "sourceAccountName": "James Doe Smith",
    "sourceBank": {
      "name": "Paycom(opay)"
    },
    "status": "COMPLETED",
    "updatedAt": "2025-01-24T13:03:20"
  },
  "relationships": {
    "account": {
      "data": {
        "id": "17129218756850-anc_acc",
        "type": "DepositAccount"
      }
    }
  }
}
```

##### Inbound Transfer Events

| Event                   | Description                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| `nip.inbound.received`  | Sent when there's a pending bank transfer (money about to be deposited) |
| `nip.inbound.completed` | Received when funds are settled into the deposit account                |

#### Managing Deposit Accounts

##### Fetch Account Balance

**Endpoint:** `GET {{baseUrl}}/api/v1/accounts/balance/{accountId}`

**Request:**

```bash
curl --request GET \
--url https://api.getanchor.co/api/v1/accounts/balance/16968636973470-anc_acc \
--header 'accept: application/json' \
--header 'x-anchor-key: <API Key>'
```

**Response:**

```json
{
  "data": {
    "availableBalance": 1000,
    "ledgerBalance": 1000,
    "hold": 0,
    "pending": 0
  }
}
```

**Balance Fields:**

- `availableBalance`: Amount immediately available for transactions
- `ledgerBalance`: Total amount including pending transactions
- `hold`: Amount being processed for outgoing transactions
- `pending`: Incoming transfers that haven't settled yet

##### Freeze Deposit Account

**Endpoint:** `POST {{baseUrl}}/api/v1/accounts/{accountId}/freeze`

**Request:**

```bash
curl --request POST \
--url https://api.sandbox.getanchor.co/api/v1/accounts/17145771745590-anc_acc/freeze \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
  "data": {
    "type": "DepositAccount",
    "attributes": {
      "freezeReason": "FRAUD",
      "freezeDescription": "Fraudulent transactions"
    }
  }
}'
```

##### Unfreeze Deposit Account

**Endpoint:** `POST {{baseUrl}}/api/v1/accounts/unfreeze`

**Request:**

```bash
curl --location 'https://api.sandbox.getanchor.co/api/v1/accounts/unfreeze' \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
    "data": {
        "id": "172286425432341-anc_acc",
        "type": "DepositAccount",
        "attributes": {}
    }
}'
```

##### Update Deposit Account

**Endpoint:** `PATCH {{baseUrl}}/api/v1/accounts/{accountId}`

Used to update a deposit account's metadata.

#### Reserved Accounts

Anchor Reserved Accounts is a feature that lets you create permanent virtual account numbers for each of your customers, making it easy to receive payments via bank transfers.

**Benefits:**

- ✔ Instant Payment Matching – Every transfer is tied to a customer
- ✔ Faster Settlements – Receive payments in real-time
- ✔ Better Customer Experience – Customers pay as they would to any regular bank account
- ✔ Simpler Reconciliation – No more searching for who sent what

**Supported Banks:**

- 9 Payment Service Bank
- Providus Bank

**Account Limit:** By default, you can generate up to 1000 reserved accounts. This can be increased upon review.

##### Creating Reserved Accounts

**Single Request Approach:**

**Endpoint:** `POST {{baseUrl}}/pay/reserved-account`

**Request:**

```bash
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

**Multi Request Approach:**

1. Create a customer using the customer creation endpoint
2. Create a reserved account by passing the customer ID and preferred provider

**Request:**

```bash
curl --location 'https://payment.getanchor.co/pay/reserved-account' \
--header 'Content-Type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
    "data": {
        "type": "ReservedAccount",
        "attributes": {
            "provider": "ninepsb"
        },
        "relationships": {
            "customer": {
                "data": {
                    "id": "17256183549ew438442741-anc_ind_cst",
                    "type": "IndividualCustomer"
                }
            }
        }
    }
}'
```

**Reserved Account Events:**

- `reservedAccount.created`: Account successfully created
- `reservedAccount.failed`: Account creation failed

**Payment Events:**

- `payin.received`: Sent when a reserved account receives a bank transfer

---

## Transfers

Anchor provides all the necessary APIs to easily integrate money movement into your solution. We currently support Nigerian Bank Naira (NGN).

### Types of Transfers

There are two types of transfers on Anchor:

1. **Book Transfer** - Send money within the same organization (free of charge)
2. **Bank Transfer (NIP Transfer)** - Send money outside your organization

**Transfer Parameters:**

- `type`: Type of transfer resource (BookTransfer, NIPTransfer, ACHTransfer)
- `attributes`: Transaction details (amount, currency, reason, reference)
- `relationships`: Source and destination accounts

### Bank Transfer (NIP Transfer)

Bank transfers allow you to send money to bank accounts in Nigeria. The process involves two steps:

1. Create a CounterParty
2. Initiate Transfer to the CounterParty

#### Create CounterParty

**Step 1: List Banks**

**Endpoint:** `GET {{baseUrl}}/api/v1/banks`

**Request:**

```bash
curl --request GET \
--url https://api.sandbox.getanchor.co/api/v1/banks \
--header 'accept: application/json' \
--header 'x-anchor-key: <API Key>'
```

**Step 2: Verify Account Details**

**Endpoint:** `GET {{baseUrl}}/api/v1/payments/verify-account/{bankIdOrBankCode}/{accountNumber}`

**Request:**

```bash
curl --request GET \
--url https://api.sandbox.getanchor.co/api/v1/payments/verify-account/000014/0000000010 \
--header 'accept: application/json' \
--header 'x-anchor-key: <API Key>'
```

**Step 3: Create CounterParty**

**Endpoint:** `POST {{baseUrl}}/api/v1/counterparties`

**Request:**

```bash
curl --request POST \
--url https://api.sandbox.getanchor.co/api/v1/counterparties \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
  "data": {
    "type": "CounterParty",
    "attributes": {
      "bankCode": "000014",
      "accountName": "Ibrahim Adeyemi",
      "accountNumber": "8111111147",
      "verifyName": true
    }
  }
}'
```

> **📘 Note**: You can verify and create a counterparty in one request by passing `verifyName: true`.

#### Initiate Transfer to CounterParty

**Endpoint:** `POST {{baseUrl}}/api/v1/transfers`

**Request:**

```bash
curl --location 'https://api.sandbox.getanchor.co/api/v1/transfers' \
--header 'Content-Type: application/json' \
--header 'x-anchor-key: <API Key>' \
--data '{
    "data": {
        "type": "NIPTransfer",
        "attributes": {
            "amount": 10000,
            "currency": "NGN",
            "reason": "Sample NIP test transfer",
            "reference": "tthwubtvwt"
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
                    "id": "17012639752430-anc_cp",
                    "type": "CounterParty"
                }
            }
        }
    }
}'
```

---

## Going Live

This section provides details about the steps you must take to get a live Anchor environment enabled and start moving real money.

### Overview

The Go-Live Guide is your comprehensive resource for seamlessly transitioning your organization to a live environment on Anchor and initiating real-money transactions using our APIs.

### Go-Live Process

#### 1. Complete Your Integration

Before going live, ensure your integration with our APIs is complete:

- Sign in on Anchor and access the dashboard
- Create API keys for sandbox/test environment
- Explore APIs and complete integration
- Join our Slack channel for real-time support

#### 2. SLA Execution

Once integration is completed:

- Complete questionnaire
- Execute Service Level Agreement (SLA)

#### 3. Schedule Pre-Go-Live Call

A pre-go-live call will be conducted via video call where you'll:

- **Use Case Assessment**: Discuss your specific use case and configure the platform accordingly
- **Solution Demo**: Provide a demo of your solution for validation
- **Billing Configuration**: Configure fees (charged to organization or passed to customers)
- **Compliance Review**: Ensure operations align with regulatory standards

> **📒 Note**: Depending on your intended use case, we may require additional business information for a smooth transition.

#### 4. KYB Approval and Going Live

Following the pre-go-live call:

- KYC documents will be reviewed and approved
- Your organization will be moved to live environment
- You can initiate real-money transactions

> **📘 Important**: After moving to Live Environment, a root account (Master Account) will be automatically created. Keep it funded if billing is configured to charge your master account.

### Timeline

**How long does it take to go-live on Anchor?**

It varies. Organizations have gone live in 24 hours after integration. However, when documents need to be provided depending on business registration, this process might take days to complete.

**Key Points:**

- Get access to transact with real money
- Create live API keys

---

## Support

### Need Help?

- Visit our [API references](https://docs.getanchor.co/reference/overview)
- For real-time support during integration, join our [Slack workspace](https://anchor-financial.slack.com/)

### Common Errors

#### Deposit Account Creation Error

If you try to create a deposit account for a customer that hasn't completed KYC:

```json
{
  "errors": [
    {
      "title": "Precondition Failed",
      "status": "412",
      "detail": "Customer has not completed the required kyc level."
    }
  ]
}
```

**Resolution**: Call the appropriate KYC validation endpoint:

- Individual Customers: [KYC Validation](https://docs.getanchor.co/reference/kyc-validation)
- Business Customers: [KYB Validation](https://docs.getanchor.co/reference/kyc-validation_1)

---

## API Reference

For complete API reference documentation, visit: [https://docs.getanchor.co/reference/overview](https://docs.getanchor.co/reference/overview)

---

_This documentation was last updated on 2025-08-21. For the most current information, please visit the official Anchor API documentation._
