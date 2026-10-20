import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import {
  ec2InstanceSchema,
  s3BucketSchema,
  awsCostReportSchema,
  type Ec2Instance,
  type S3Bucket,
  type AwsCostReport,
} from './cloud.schema';

export const cloudKeys = {
  profiles: () => ['cloud', 'profiles'] as const,
  instances: (profile: string, region?: string) => ['cloud', 'instances', profile, region] as const,
  buckets: (profile: string) => ['cloud', 'buckets', profile] as const,
  costs: (profile: string) => ['cloud', 'costs', profile] as const,
};

export function useAwsProfiles() {
  return useQuery({
    queryKey: cloudKeys.profiles(),
    queryFn: () => ipc(CMD.AWS_LIST_PROFILES, {}, z.array(z.string())),
    staleTime: 300_000,
  });
}

export function useEc2Instances(profile: string, region?: string) {
  return useQuery<Ec2Instance[]>({
    queryKey: cloudKeys.instances(profile, region),
    queryFn: () =>
      ipc(
        CMD.AWS_LIST_EC2_INSTANCES,
        { profile, region: region || null },
        z.array(ec2InstanceSchema),
      ),
    enabled: Boolean(profile),
    staleTime: 30_000,
  });
}

export function useS3Buckets(profile: string) {
  return useQuery<S3Bucket[]>({
    queryKey: cloudKeys.buckets(profile),
    queryFn: () => ipc(CMD.AWS_LIST_S3_BUCKETS, { profile }, z.array(s3BucketSchema)),
    enabled: Boolean(profile),
    staleTime: 60_000,
  });
}

export function useAwsCosts(profile: string, forceRefresh = false) {
  return useQuery<AwsCostReport>({
    queryKey: cloudKeys.costs(profile),
    queryFn: () => ipc(CMD.AWS_GET_COSTS, { profile, forceRefresh }, awsCostReportSchema),
    enabled: Boolean(profile),
    staleTime: 3_600_000,
  });
}

export function useEc2Action() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { profile: string; region: string; instanceId: string; action: string }) =>
      ipc(CMD.AWS_INSTANCE_ACTION, args, z.string()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud', 'instances'] });
    },
  });
}
