import { afterEach, describe, expect, it } from 'vitest';
import { demoEvidence } from '@/lib/data/demo';
import { loadStudyEvidence, StudyEvidenceNotFoundError } from '@/lib/data/study-repository';

const originalMongoUri = process.env.MONGODB_URI;

afterEach(() => {
  if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = originalMongoUri;
});

describe('study evidence repository', () => {
  it('serves only the matching portable study when MongoDB is not configured', async () => {
    delete process.env.MONGODB_URI;
    await expect(loadStudyEvidence(demoEvidence.study.id)).resolves.toMatchObject({
      study: { id: demoEvidence.study.id },
    });
  });

  it('fails closed instead of substituting the demo for an unknown study', async () => {
    delete process.env.MONGODB_URI;
    await expect(loadStudyEvidence('DOES-NOT-EXIST')).rejects.toBeInstanceOf(StudyEvidenceNotFoundError);
  });
});
