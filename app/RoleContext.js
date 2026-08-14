"use client";

import { createContext, useContext } from "react";

export const RoleContext = createContext(undefined);

export function useRole() {
  return useContext(RoleContext);
}
