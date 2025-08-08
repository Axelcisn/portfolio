"use client";
import { useEffect, useState } from "react";
export default function useDebounce(value, delay = 300) {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}
