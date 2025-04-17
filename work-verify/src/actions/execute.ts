"use server";

import { makeXcrow } from "@//lib/xcrow";
import { ExecuteInput, ExecuteOutput } from "@xcrowdev/node";

export const execute = async (
  params: ExecuteInput
): Promise<ExecuteOutput> => {
  const xcrow = await makeXcrow()
  const response = await xcrow.execute(params);

  return response;
};
