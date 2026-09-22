import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://jozveyar:jozveyar@127.0.0.1:5432/jozveyar',
  },
  // مهاجرت همیشه فایل SQL است و دستی خوانده می‌شود. `push` عمداً استفاده
  // نمی‌شود: روی تولید یعنی تغییر اسکیما بدون اینکه جایی ثبت شود.
  strict: true,
  verbose: true,
});
