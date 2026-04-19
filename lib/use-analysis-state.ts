/**
 * Shared localStorage hook for persisting query and analysis result across pages.
 */

import { useState, useEffect } from "react";
import type { AnalyzeResponse } from "@/engine/types";

const STORAGE_KEY_QUERY = "eie_query";
const STORAGE_KEY_RESULT = "eie_result";

export function useAnalysisState() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  // Load from localStorage on mount
  // Clear results on hard refresh (page reload), but keep query
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Detect if this is a hard refresh (page reload) vs navigation
    let isHardRefresh = false;
    
    // Try Performance Navigation Timing API first
    try {
      const navigationType = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigationType) {
        isHardRefresh = navigationType.type === 'reload';
      }
    } catch {
      // Fallback: check if we have a session flag
      // If no flag exists, this is likely a hard refresh
      const sessionFlag = sessionStorage.getItem('eie_session_active');
      if (!sessionFlag) {
        isHardRefresh = true;
        sessionStorage.setItem('eie_session_active', 'true');
      }
    }
    
    // On hard refresh, clear results but keep query
    if (isHardRefresh) {
      localStorage.removeItem(STORAGE_KEY_RESULT);
    } else {
      // On navigation, load saved result
      const savedResult = localStorage.getItem(STORAGE_KEY_RESULT);
      if (savedResult) {
        try {
          setResult(JSON.parse(savedResult) as AnalyzeResponse);
        } catch {
          // Ignore parse errors
        }
      }
    }
    
    // Always load query from localStorage
    const savedQuery = localStorage.getItem(STORAGE_KEY_QUERY);
    if (savedQuery) setQuery(savedQuery);
  }, []);

  // Save query to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (query) {
      localStorage.setItem(STORAGE_KEY_QUERY, query);
    } else {
      localStorage.removeItem(STORAGE_KEY_QUERY);
    }
  }, [query]);

  // Save result to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (result) {
      localStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(result));
    } else {
      localStorage.removeItem(STORAGE_KEY_RESULT);
    }
  }, [result]);

  return { query, setQuery, result, setResult };
}
