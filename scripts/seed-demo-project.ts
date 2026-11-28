import { getDb, closeMongoClient } from '../apps/web/lib/db/client';
import { COLLECTIONS } from '../apps/web/lib/db/schema';
import { createStoryboard, getStoryboard } from '../apps/web/lib/db/repositories/storyboard';
import { ObjectId } from 'mongodb';

async function seed() {
  const db = await getDb();
  try {
    const demoEmail = process.argv[2] || 'demo@namastevideo.ai';
    const accessUser = await db.collection(COLLECTIONS.INTERNAL_ACCESS).findOne({ email: demoEmail });
    if (!accessUser) {
      console.error(`Demo user with email '${demoEmail}' not found. Please provision user first.`);
      process.exit(1);
    }
    const userId = String(accessUser._id);

    // Reuse or create demo project
    let project = await db.collection(COLLECTIONS.PROJECTS).findOne({ ownerId: userId, title: 'AI Video Revolution in India' });
    let projectId: string;

    if (!project) {
      projectId = new ObjectId().toHexString();
      const conversationId = new ObjectId().toHexString();

      // Create conversation
      await db.collection(COLLECTIONS.CONVERSATIONS).insertOne({
        _id: conversationId as any,
        projectId,
        ownerId: userId,
        schemaVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create Project
      await db.collection(COLLECTIONS.PROJECTS).insertOne({
        _id: projectId as any,
        ownerId: userId,
        title: 'AI Video Revolution in India',
        conversationId,
        revision: 1,
        draftRevision: 1,
        contentRevision: 1,
        deletedAt: null,
        flags: {
          drafts: false,
          ready: true,
          scheduled: false,
          published: false,
          needsAttention: false,
        },
        schemaVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create Draft
      await db.collection(COLLECTIONS.DRAFTS).insertOne({
        _id: new ObjectId().toHexString() as any,
        projectId,
        ownerId: userId,
        revision: 1,
        topic: 'How Generative AI is Empowering Digital Creators in India',
        audience: 'Digital content creators, educators, and indie filmmakers',
        notes: 'Focus on regional language voice synthesis, automated b-roll and viral hooks.',
        voicePreset: 'daniel-test',
        editablePlan: null,
        planStale: false,
        contentHash: 'hash_demo_1',
        canonicalizationVersion: 1,
        validationIssues: [],
        schemaVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      projectId = String(project._id);
    }

    // Ensure storyboard exists
    let existingSb = await getStoryboard(projectId, userId);
    if (!existingSb) {
      const frames = [
        {
          _id: new ObjectId(),
          order: 0,
          imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop',
          caption: 'Hook: The AI Creator Wave',
          narrationText: 'Every second, thousands of creators across India are transforming simple ideas into cinematic stories with AI.',
        },
        {
          _id: new ObjectId(),
          order: 1,
          imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop',
          caption: 'Core: Multilingual Voice & Storyboards',
          narrationText: 'With automated storyboarding and authentic Indian voice synthesis, video creation is now 10 times faster.',
        },
        {
          _id: new ObjectId(),
          order: 2,
          imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop',
          caption: 'Conclusion: Start Creating with NamasteVideo',
          narrationText: 'Your vision, amplified. Namaste and welcome to the future of storytelling.',
        },
      ];

      existingSb = await createStoryboard(projectId, userId, frames, 'Initial seed storyboard');
    }

    console.log(`Seeded Project ID: ${projectId}, Storyboard ID: ${existingSb._id}`);
  } finally {
    await closeMongoClient();
  }
}

seed();
