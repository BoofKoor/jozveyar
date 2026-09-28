-- نقش چاپخانه و محدوده‌اش (برش ۵٫۳، ADR-042): ستون نوع‌دار `admin_user_roles.print_partner_id` با کلید خارجی به جای `scope`
-- jsonb، که تا ۵٫۲ فقط null بود (CHECK `admin_user_roles_scope`)، پس چیزی از دست نمی‌رود.
--
-- تولیدی (drizzle-kit). CHECK `admin_user_roles_partner`: نقش چاپخانه یعنی دقیقاً یک چاپخانه، و نقش‌های دیگر هیچ. «کاربر
-- چاپخانه فقط همین نقش را دارد» EXCLUDE است و drizzle آن را نمی‌شناسد، پس در 0020، دست‌نویس. خود نقش `print_partner` و
-- مجوزهایش را دادهٔ پایه می‌نشاند (`seedAdminRoles`)، نه مهاجرت.

ALTER TABLE "admin_user_roles" DROP CONSTRAINT "admin_user_roles_scope";--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD COLUMN "print_partner_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_print_partner_id_print_partners_id_fk" FOREIGN KEY ("print_partner_id") REFERENCES "public"."print_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" DROP COLUMN "scope";--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_partner" CHECK (("admin_user_roles"."role_id" = 'print_partner') = ("admin_user_roles"."print_partner_id" IS NOT NULL));
