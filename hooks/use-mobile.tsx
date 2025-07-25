"use client"

import { useMediaQuery } from "usehooks-ts"

export function useMobile() {
  return useMediaQuery("(max-width: 768px)")
}
