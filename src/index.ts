/**
 * GitHub Webhook Sanitization Proxy
 *
 * A Bun server that sanitizes GitHub webhook payloads before forwarding to Linear.
 * Removes sensitive information while preserving Linear issue IDs for PR linking.
 */

import { ALLOWED_EVENTS } from "./config";
import { sanitizePayload } from "./sanitize";
import { verifySignature, signPayload } from "./signature";

/**
 * Validates required environment variables and returns configuration.
 * Exits with helpful error messages if validation fails.
 */
function validateConfig(): {
  port: number;
  webhookSecret: string;
  linearWebhookUrl: string;
} {
  const errors: string[] = [];

  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    errors.push(
      "LINEAR_WEBHOOK_SECRET is required. Copy this from Linear's GitHub Enterprise Server integration setup."
    );
  }

  const linearWebhookUrl = process.env.LINEAR_WEBHOOK_URL;
  if (!linearWebhookUrl) {
    errors.push(
      "LINEAR_WEBHOOK_URL is required. Copy the webhook URL from Linear's GitHub Enterprise Server integration setup."
    );
  }

  if (errors.length > 0) {
    console.error("Configuration error(s):");
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error("\nSee README.md for setup instructions.");
    process.exit(1);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("PORT must be a valid port number (1-65535)");
    process.exit(1);
  }

  return {
    port,
    webhookSecret: webhookSecret!,
    linearWebhookUrl: linearWebhookUrl!,
  };
}

const config = validateConfig();

/**
 * Checks if an event/action combination is allowed.
 */
function isEventAllowed(event: string, action: string | undefined): boolean {
  const allowedActions = ALLOWED_EVENTS[event];
  if (!allowedActions) {
    return false;
  }
  // Some events don't have actions
  if (!action) {
    return allowedActions.length === 0;
  }
  return allowedActions.includes(action);
}

const server = Bun.serve({
  port: config.port,

  async fetch(request: Request): Promise<Response> {
    // Only accept POST requests to the webhook endpoint
    const url = new URL(request.url);
    console.log(`Request: ${request.method} ${url.pathname}`);
    if (request.method !== "POST" || url.pathname !== "/") {
      return new Response("Not Found", { status: 404 });
    }

    // Get required headers
    const event = request.headers.get("x-github-event");
    const signature = request.headers.get("x-hub-signature");
    const deliveryId = request.headers.get("x-github-delivery");

    if (!event) {
      return new Response("Missing x-github-event header", { status: 400 });
    }

    // Read and parse the payload
    const rawBody = await request.text();
    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    const action = payload.action as string | undefined;

    // Check if this event is whitelisted
    if (!isEventAllowed(event, action)) {
      // Return 200 to prevent GitHub retries, but don't forward
      console.log(`Filtered event: ${event}/${action || "no-action"}`);
      return new Response("Event filtered", { status: 200 });
    }

    // Verify the webhook signature
    const isValid = await verifySignature(
      rawBody,
      signature,
      config.webhookSecret
    );
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }

    // Sanitize the payload
    const sanitizedPayload = sanitizePayload(event, payload);
    const sanitizedBody = JSON.stringify(sanitizedPayload);

    // Re-sign the sanitized payload
    const newSignature = await signPayload(sanitizedBody, config.webhookSecret);

    // Forward to Linear
    try {
      const response = await fetch(config.linearWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": newSignature,
          "X-GitHub-Event": event,
          ...(deliveryId && { "X-GitHub-Delivery": deliveryId }),
        },
        body: sanitizedBody,
      });

      console.log(
        `Forwarded ${event}/${action || "no-action"} -> ${response.status}`
      );

      // Return Linear's response status
      return new Response(await response.text(), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Failed to forward webhook:", error);
      return new Response("Failed to forward webhook", { status: 502 });
    }
  },
});

console.log(
  `GitHub Webhook Proxy listening on http://localhost:${server.port}`
);
console.log(`Forwarding to: ${config.linearWebhookUrl}`);
