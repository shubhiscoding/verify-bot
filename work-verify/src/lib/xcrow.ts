"use server";

import { Xcrow } from "@xcrowdev/node";

if (!process.env.XCROW_API_KEY) throw new Error("XCROW_API_KEY is required");
if (!process.env.XCROW_APPLICATION_ID)
  throw new Error("XCROW_APPLICATION_ID is required");

const xcrow = new Xcrow({
  apiKey: process.env.XCROW_API_KEY,
  applicationId: process.env.XCROW_APPLICATION_ID,
});

export async function makeXcrow() {
  return xcrow
}