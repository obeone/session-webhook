# Session Webhook Server

This project provides a webhook server for `session.js`. It serves two primary functions:

1. **Exposes Webhook Endpoints**: It allows you to control a Session client via a simple REST API to perform actions like sending messages, attachments, and managing profile details.
2. **Forwards Session Events**: It listens to all events from the Session client (like incoming messages, reactions, etc.) and forwards them to a pre-configured external webhook URL.

This makes it easy to integrate Session messaging capabilities into other applications, such as automation platforms (n8n, Zapier), custom bots, or backend services.

## Table of Contents

- [Session Webhook Server](#session-webhook-server)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Local Installation](#local-installation)
  - [Docker Deployment](#docker-deployment)
  - [Configuration](#configuration)
  - [API Reference](#api-reference)
    - [Authentication](#authentication)
    - [Endpoints](#endpoints)
      - [`GET /status`](#get-status)
      - [`POST /sendMessage`](#post-sendmessage)
      - [`POST /sendAttachment`](#post-sendattachment)
      - [`POST /deleteMessage`](#post-deletemessage)
      - [`POST /setDisplayName`](#post-setdisplayname)
      - [`POST /setAvatar`](#post-setavatar)
      - [`POST /notifyScreenshot`](#post-notifyscreenshot)
      - [`POST /notifyMediaSaved`](#post-notifymediasaved)
      - [`POST /addReaction`](#post-addreaction)
      - [`POST /removeReaction`](#post-removereaction)
  - [Forwarded Events Reference](#forwarded-events-reference)
    - [Event Structure](#event-structure)
    - [Event Types](#event-types)

---

## Features

- **RESTful API**: Control Session actions with simple HTTP requests.
- **Event Forwarding**: Get real-time notifications for all Session activity.
- **Secure**: Protect your API endpoints with an API key.
- **Persistent Storage**: Uses a file-based storage system to maintain the Session identity across restarts.
- **Easy to Deploy**: Run it locally with `bun` or as a Docker container.

## Prerequisites

- **Bun**: For local installation. [Installation guide](https://bun.sh/docs/installation).
- **Docker & Docker Compose**: For containerized deployment.

## Local Installation

1. **Clone the repository:**

    ```bash
    git clone <your-repo-url>
    cd bot-webhook
    ```

2. **Install dependencies:**

    ```bash
    bun install
    ```

3. **Configure your environment:**
    Copy the example environment file and edit it with your own values.

    ```bash
    cp .env.example .env
    ```

    See the [Configuration](#configuration) section for details on each variable. **You must provide a `SESSION_MNEMONIC`**.

4. **Run the server:**
    - For production:

      ```bash
      bun start
      ```

    - For development (with auto-reloading):

      ```bash
      bun run dev
      ```

The server will be running on the port specified in your `.env` file (default: `8080`).

## Docker Deployment

1. **Clone the repository:**

    ```bash
    git clone <your-repo-url>
    cd bot-webhook
    ```

2. **Configure your environment:**
    Create a `.env` file from the example. The `docker-compose.yml` file will automatically load it.

    ```bash
    cp .env.example .env
    ```

    Fill in the variables, especially `SESSION_MNEMONIC` and `API_KEY`.

3. **Build and run with Docker Compose:**

    ```bash
    docker-compose up --build -d
    ```

4. **Check the status and logs:**

    ```bash
    # Check container status
    docker-compose ps

    # View logs in real-time
    docker-compose logs -f session-webhook
    ```

5. **To stop the server:**

    ```bash
    docker-compose down
    ```

    The `session-data` volume will persist your session storage, so you won't lose your identity.

## Configuration

The server is configured using environment variables. Create a `.env` file in the root directory to set them.

| Variable               | Description                                                                 | Default Value                  | Required |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------ | -------- |
| `PORT`                 | The port on which the server will listen.                                   | `8080`                         | No       |
| `API_KEY`              | A secret key to authorize API requests.                                     | `your-secure-api-key-here`     | Yes      |
| `WEBHOOK_URL`          | The external URL to which Session events will be forwarded.                 | `https://example.com/signal`   | Yes      |
| `SESSION_MNEMONIC`     | The 13-word recovery phrase for your Session account.                       | (none)                         | **Yes**  |
| `SESSION_DISPLAY_NAME` | The display name for the Session bot.                                       | `Session Webhook Bot`          | No       |
| `STORAGE_FILE`         | Path to the file for persistent session storage.                            | `./session-storage.db`         | No       |
| `LOG_LEVEL`            | The logging level (`error`, `warn`, `info`, `http`, `verbose`, `debug`).    | `info`                         | No       |

---

## API Reference

### Authentication

All endpoints (except `/status`) are protected. You must provide the API key in the `X-API-Key` header with every request.

### Endpoints

#### `GET /status`

Health check endpoint to verify that the server is running.

- **Authentication**: None
- **Example Request**:

  ```bash
  curl http://localhost:8080/status
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "ok": true,
    "sessionId": "05xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "uptime": 123.456,
    "timestamp": "2023-10-27T10:00:00.000Z"
  }
  ```

---

#### `POST /sendMessage`

Sends a text message to a Session ID.

- **Request Body**:

  ```json
  {
    "to": "recipient_session_id",
    "text": "Hello from the webhook server!"
  }
  ```

- **Example Request**:

  ```bash
  curl -X POST http://localhost:8080/sendMessage \
    -H "Content-Type: application/json" \
    -H "X-API-Key: <YOUR_API_KEY>" \
    -d '{
          "to": "<RECIPIENT_SESSION_ID>",
          "text": "Hello, world!"
        }'
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "messageHash": "...",
    "syncMessageHash": "...",
    "timestamp": 1678886400000
  }
  ```

---

#### `POST /sendAttachment`

Sends a file attachment to a Session ID. The file data must be Base64 encoded.

- **Request Body**:

  ```json
  {
    "to": "recipient_session_id",
    "filename": "image.jpg",
    "mimeType": "image/jpeg",
    "data": "base64_encoded_file_data"
  }
  ```

- **Example Request**:

  ```bash
  curl -X POST http://localhost:8080/sendAttachment \
    -H "Content-Type: application/json" \
    -H "X-API-Key: <YOUR_API_KEY>" \
    -d '{
          "to": "<RECIPIENT_SESSION_ID>",
          "filename": "test.txt",
          "mimeType": "text/plain",
          "data": "SGVsbG8sIFdvcmxkIQ=="
        }'
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "messageHash": "...",
    "syncMessageHash": "...",
    "timestamp": 1678886400000
  }
  ```

---

#### `POST /deleteMessage`

Deletes a previously sent message.

- **Request Body**:

  ```json
  {
    "to": "recipient_session_id",
    "timestamp": 1678886400000,
    "hash": "message_hash"
  }
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "message": "Message deleted successfully"
  }
  ```

---

#### `POST /setDisplayName`

Updates the profile's display name.

- **Request Body**:

  ```json
  {
    "displayName": "New Bot Name"
  }
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "message": "Display name updated successfully"
  }
  ```

---

#### `POST /setAvatar`

Updates the profile's avatar. The image data must be Base64 encoded.

- **Request Body**:

  ```json
  {
    "avatar": "base64_encoded_image_data"
  }
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "message": "Avatar updated successfully"
  }
  ```

---

#### `POST /notifyScreenshot`

Notifies a contact that a screenshot has been taken.

- **Request Body**:

  ```json
  {
    "to": "recipient_session_id"
  }
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "message": "Screenshot notification sent"
  }
  ```

---

#### `POST /notifyMediaSaved`

Notifies a contact that media from a message was saved.

- **Request Body**:

  ```json
  {
    "to": "recipient_session_id",
    "timestamp": 1678886400000
  }
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "message": "Media saved notification sent"
  }
  ```

---

#### `POST /addReaction`

Adds a reaction to a specific message.

- **Request Body**:

  ```json
  {
    "to": "recipient_session_id",
    "timestamp": 1678886400000,
    "emoji": "👍",
    "author": "author_session_id"
  }
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "message": "Reaction added"
  }
  ```

---

#### `POST /removeReaction`

Removes a reaction from a specific message.

- **Request Body**:

  ```json
  {
    "to": "recipient_session_id",
    "timestamp": 1678886400000,
    "emoji": "👍",
    "author": "author_session_id"
  }
  ```

- **Success Response (`200 OK`)**:

  ```json
  {
    "success": true,
    "message": "Reaction removed"
  }
  ```

---

## Forwarded Events Reference

The server listens for events from the Session client and forwards them as `POST` requests to the `WEBHOOK_URL` defined in your configuration.

### Event Structure

All forwarded events have the following JSON structure:

```json
{
  "event": "eventName",
  "payload": {
    // Payload content depends on the event type
  },
  "timestamp": "2023-10-27T10:00:00.000Z"
}
```

### Event Types

The following events are forwarded. The `payload` content is determined by the `@session.js/client` library.

| Event Name                 | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| `message`                  | A new message is received.                                               |
| `syncMessage`              | A message from another linked device is synced.                          |
| `syncDisplayName`          | A contact's display name has changed.                                    |
| `syncAvatar`               | A contact's avatar has changed.                                          |
| `messageDeleted`           | A message was deleted by the sender.                                     |
| `messageRead`              | A sent message has been marked as read by the recipient.                 |
| `messageTypingIndicator`   | A contact is typing a message.                                           |
| `screenshotTaken`          | A contact has taken a screenshot of the conversation.                    |
| `mediaSaved`               | A contact has saved media from a message.                                |
| `messageRequestApproved`   | A contact has accepted your message request.                             |
| `call`                     | An incoming or outgoing call event has occurred.                         |
| `reactionAdded`            | A reaction was added to one of your messages.                            |
| `reactionRemoved`          | A reaction was removed from one of your messages.                        |
