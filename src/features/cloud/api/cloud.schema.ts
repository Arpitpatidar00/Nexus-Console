import { z } from 'zod';

export const ec2InstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  instanceType: z.string(),
  publicIp: z.string().nullable().optional(),
  privateIp: z.string().nullable().optional(),
  region: z.string(),
  isProd: z.boolean(),
  tags: z.array(z.tuple([z.string(), z.string()])),
});
export type Ec2Instance = z.infer<typeof ec2InstanceSchema>;

export const s3BucketSchema = z.object({
  name: z.string(),
  creationDate: z.string(),
  region: z.string().nullable().optional(),
});
export type S3Bucket = z.infer<typeof s3BucketSchema>;

export const awsCostItemSchema = z.object({
  service: z.string(),
  amount: z.number(),
  unit: z.string(),
});
export type AwsCostItem = z.infer<typeof awsCostItemSchema>;

export const awsCostReportSchema = z.object({
  monthToDateTotal: z.number(),
  currency: z.string(),
  topServices: z.array(awsCostItemSchema),
  cachedAt: z.number(),
});
export type AwsCostReport = z.infer<typeof awsCostReportSchema>;
