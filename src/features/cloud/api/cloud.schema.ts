import { z } from 'zod';

export const ec2InstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  instance_type: z.string(),
  public_ip: z.string().nullable().optional(),
  private_ip: z.string().nullable().optional(),
  region: z.string(),
  is_prod: z.boolean(),
  tags: z.array(z.tuple([z.string(), z.string()])),
});
export type Ec2Instance = z.infer<typeof ec2InstanceSchema>;

export const s3BucketSchema = z.object({
  name: z.string(),
  creation_date: z.string(),
  region: z.string().nullable().optional(),
});
export type S3Bucket = z.infer<typeof s3BucketSchema>;

export const awsCostItemSchema = z.object({
  service: z.string(),
  amount: z.number(),
  currency: z.string().optional(),
  unit: z.string().optional(),
});
export type AwsCostItem = z.infer<typeof awsCostItemSchema>;

export const awsCostReportSchema = z.object({
  month_to_date_total: z.number(),
  currency: z.string(),
  top_services: z.array(awsCostItemSchema),
  cached_at: z.number(),
});
export type AwsCostReport = z.infer<typeof awsCostReportSchema>;
