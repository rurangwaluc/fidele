import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
  permissions,
  responsibilityGroupPermissions,
  responsibilityGroups,
  users,
} from "@erc/db";
import {
  ALL_PERMISSIONS,
  RESPONSIBILITY_GROUP_LABELS,
  RESPONSIBILITY_GROUP_PERMISSIONS,
  RESPONSIBILITY_GROUPS,
  USER_ROLES,
} from "@erc/shared";

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
  const ownerPassword = process.env.OWNER_PASSWORD;
  const ownerName = process.env.OWNER_NAME || "Owner";
  const ownerPhone = process.env.OWNER_PHONE;

  if (!ownerEmail || !ownerPassword) {
    throw new Error("OWNER_EMAIL and OWNER_PASSWORD are required");
  }

  console.log("Seeding permissions...");

  for (const permissionKey of ALL_PERMISSIONS) {
    const existing = await db
      .select()
      .from(permissions)
      .where(eq(permissions.key, permissionKey))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(permissions).values({
        key: permissionKey,
        description: permissionKey,
      });
    }
  }

  console.log("Seeding responsibility groups...");

  for (const groupKey of Object.values(RESPONSIBILITY_GROUPS)) {
    const existing = await db
      .select()
      .from(responsibilityGroups)
      .where(eq(responsibilityGroups.key, groupKey))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(responsibilityGroups).values({
        key: groupKey,
        name: RESPONSIBILITY_GROUP_LABELS[groupKey],
        description: RESPONSIBILITY_GROUP_LABELS[groupKey],
      });
    }
  }

  console.log("Seeding responsibility group permissions...");

  for (const [groupKey, groupPermissionKeys] of Object.entries(
    RESPONSIBILITY_GROUP_PERMISSIONS,
  )) {
    const [group] = await db
      .select()
      .from(responsibilityGroups)
      .where(eq(responsibilityGroups.key, groupKey))
      .limit(1);

    if (!group) continue;

    for (const permissionKey of groupPermissionKeys) {
      const [permission] = await db
        .select()
        .from(permissions)
        .where(eq(permissions.key, permissionKey))
        .limit(1);

      if (!permission) continue;

      const existing = await db
        .select()
        .from(responsibilityGroupPermissions)
        .where(eq(responsibilityGroupPermissions.permissionId, permission.id))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(responsibilityGroupPermissions).values({
          responsibilityGroupId: group.id,
          permissionId: permission.id,
        });
      }
    }
  }

  console.log("Seeding owner...");

  const existingOwner = await db
    .select()
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);

  if (existingOwner.length === 0) {
    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    await db.insert(users).values({
      name: ownerName,
      email: ownerEmail,
      phone: ownerPhone,
      passwordHash,
      role: USER_ROLES.OWNER,
      isActive: true,
    });

    console.log(`Owner created: ${ownerEmail}`);
  } else {
    console.log(`Owner already exists: ${ownerEmail}`);
  }

  console.log("Seed completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
