import { randomUUID } from "node:crypto";
import type { Hex } from "viem";
import type { DetectPayload } from "./types";

export const JOB_TTL_MS = 10 * 60 * 1000;

export interface Job {
  embedding: number[]; // never leaves the server
  imageHash: Hex;
  createdAt: number;
  detect?: DetectPayload; // safe-to-return summary, so /api/detect can be re-read by jobId
}

const jobs = new Map<string, Job>();

function sweep(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function newJobId(): string {
  return randomUUID();
}

export function createJob(
  embedding: number[],
  imageHash: Hex,
  jobId = newJobId(),
  detect?: DetectPayload,
): string {
  sweep();
  jobs.set(jobId, { embedding, imageHash, createdAt: Date.now(), detect });
  return jobId;
}

export function getJob(jobId: string): Job | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (Date.now() - job.createdAt > JOB_TTL_MS) {
    jobs.delete(jobId);
    return null;
  }
  return job;
}

export function deleteJob(jobId: string): void {
  jobs.delete(jobId);
}
