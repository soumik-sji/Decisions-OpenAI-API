import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
const enabled = Boolean(publicKey && secretKey);

let spanProcessor: LangfuseSpanProcessor | undefined;
let sdk: NodeSDK | undefined;

function initTracing() {
  if (sdk) return;
  if (!enabled) {
    console.log("Langfuse tracing disabled (LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set)");
    return;
  }
  spanProcessor = new LangfuseSpanProcessor();
  sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();
  console.log("Langfuse tracing enabled");
}

async function flushTracing() {
  await spanProcessor?.forceFlush();
}

async function shutdownTracing() {
  await sdk?.shutdown();
  sdk = undefined;
  spanProcessor = undefined;
}

export { flushTracing, initTracing, shutdownTracing };
