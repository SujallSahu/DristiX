/**
 * Seeds an admin account, demo students, and the SSC CGL sample exam.
 *
 * Run with: npm run db:seed
 *
 * Idempotent: re-running updates the seeded records rather than duplicating
 * them. It only ever touches the DristiX database, never any other database on
 * your local MongoDB.
 *
 * This is the ONLY place the answer key enters the system. The frontend never
 * receives it — see services/question.service.ts.
 */
import { connectDb, disconnectDb } from './db.js';
import { Exam, User } from './models/index.js';
import { hashPassword } from './services/auth.service.js';
import { CATALOG_SEED } from './catalogSeed.js';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@dristix.edu';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'DristiX-Admin';
const STUDENT_PASSWORD = process.env.SEED_STUDENT_PASSWORD ?? 'student123';


async function main(): Promise<void> {
  await connectDb();
  console.log('Seeding DristiX database...\n');

  // ── Admin ──────────────────────────────────────────────────────────
  if (ADMIN_PASSWORD) {
    const adminHash = await hashPassword(ADMIN_PASSWORD);
    await User.deleteMany({ role: 'ADMIN', username: { $ne: ADMIN_USERNAME.toLowerCase() } }).exec();
  await User.findOneAndUpdate(
    { username: ADMIN_USERNAME.toLowerCase() },
    {
      $set: {
        name: 'DristiX Administrator',
        rollNumber: 'ADMIN-001',
        email: ADMIN_EMAIL,
        emailVerified: true,
        username: ADMIN_USERNAME.toLowerCase(),
        passwordHash: adminHash,
        role: 'ADMIN',
      },
    },
    { upsert: true, new: true }
  ).exec();
    console.log(`  admin      ${ADMIN_EMAIL}`);
  } else {
    console.log('  admin      [Skipped - Set SEED_ADMIN_PASSWORD in environment to seed admin]');
  }

  // ── Students ───────────────────────────────────────────────────────
  const students = [
    { name: 'Rohit Sharma', email: 'rohit@dristix.edu', rollNumber: 'DX-101', pref: 'Screen Reader' },
    { name: 'Ananya Verma', email: 'ananya@dristix.edu', rollNumber: 'DX-102', pref: 'High Contrast' },
    { name: 'Vikram Singh', email: 'vikram@dristix.edu', rollNumber: 'DX-103', pref: 'Low Vision' },
  ];

  const studentHash = await hashPassword(STUDENT_PASSWORD);
  for (const s of students) {
    await User.findOneAndUpdate(
      { email: s.email },
      {
        $set: {
          name: s.name,
          rollNumber: s.rollNumber,
          accessibilityPreference: s.pref,
          passwordHash: studentHash,
          role: 'STUDENT',
        },
      },
      { upsert: true }
    ).exec();
    console.log(`  student    ${s.email}  (${s.rollNumber})`);
  }

  // ── Exam catalog ───────────────────────────────────────────────────
  // Upserted by code so re-seeding refreshes an existing exam's content
  // instead of creating a duplicate, and never touches attempts already made
  // against it.
  let examCount = 0;
  let questionCount = 0;

  for (const exam of CATALOG_SEED) {
    await Exam.findOneAndUpdate(
      { code: exam.code },
      { $set: { ...exam } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
    examCount++;
    questionCount += exam.questions.length;
  }

  console.log(`\n  catalog    ${examCount} exams, ${questionCount} questions`);
  for (const exam of CATALOG_SEED) {
    console.log(
      `    ${exam.code.padEnd(16)} ${String(exam.questions.length).padStart(2)} questions  ${
        exam.negativeMarking > 0 ? `-${exam.negativeMarking} per wrong` : 'no negative marking'
      }`
    );
  }

  console.log('\nDone.\n');
  console.log('  Sign in with:');
  console.log(`    admin    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`    student  rohit@dristix.edu / ${STUDENT_PASSWORD}\n`);

  await disconnectDb();
}

main().catch(async (err) => {
  console.error('\nSeed failed:', err);
  await disconnectDb();
  process.exit(1);
});
