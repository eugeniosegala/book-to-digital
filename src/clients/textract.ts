import {
  TextractClient,
  AnalyzeDocumentCommand,
  type AnalyzeDocumentResponse,
} from "@aws-sdk/client-textract";
import { TEXTRACT_MAX_ATTEMPTS } from "../config.js";

const clients = new Map<string, TextractClient>();

const getClient = (region: string): TextractClient => {
  let client = clients.get(region);
  if (!client) {
    client = new TextractClient({ region, maxAttempts: TEXTRACT_MAX_ATTEMPTS });
    clients.set(region, client);
  }
  return client;
};

export const analyzePageImage = async (
  imageBuffer: Buffer,
  region: string,
): Promise<AnalyzeDocumentResponse> => {
  const client = getClient(region);

  const command = new AnalyzeDocumentCommand({
    Document: { Bytes: imageBuffer },
    FeatureTypes: ["LAYOUT"],
  });

  return client.send(command);
};
