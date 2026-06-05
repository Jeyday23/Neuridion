import type { ScrapedFsn } from '@/lib/scrapers/bfarm'

export interface GoldenProfile {
  slug:         string
  device_name:  string
  manufacturer: string
  intended_use: string
  emdn_code?:   string
  device_class?: string
  period:       { from: string; to: string }
  sources:      string[]
  competitor_terms: Array<{ name: string; manufacturer?: string }>
  expected: {
    must_find: ExpectedRecord[]
    known_noise: string[]
  }
}

export interface ExpectedRecord {
  source:        string
  external_id?:  string
  title_pattern?: string
  url?:          string
  description?:  string
}

export interface SourceResult {
  source:    string
  items:     ScrapedFsn[]
  warnings:  string[]
  duration_ms: number
}

export interface MatchResult {
  expected:  ExpectedRecord
  found:     boolean
  matched_item?: ScrapedFsn
}

export interface ProfileBenchmark {
  profile:          GoldenProfile
  sources:          SourceResult[]
  total_scraped:    number
  keyword_scores:   Map<string, number>
  recall:           { found: number; expected: number; rate: number }
  precision_sample: { relevant_looking: number; sampled: number; rate: number }
  match_results:    MatchResult[]
  noise_dominance:  Array<{ term: string; count: number; percentage: number }>
  duration_ms:      number
}

export interface BenchmarkRun {
  timestamp:  string
  mode:       'live' | 'fixture'
  profiles:   ProfileBenchmark[]
  summary: {
    avg_recall:    number
    avg_precision: number
    total_scraped: number
    total_expected: number
    total_found:   number
    duration_ms:   number
  }
}
