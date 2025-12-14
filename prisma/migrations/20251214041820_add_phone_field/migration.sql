/*
  Warnings:

  - You are about to drop the column `vendorId` on the `Menu` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `vendorId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Vendor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VendorAddress` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VendorOpenHours` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `businessId` to the `Menu` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- DropForeignKey
ALTER TABLE "public"."Menu" DROP CONSTRAINT "Menu_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."VendorAddress" DROP CONSTRAINT "VendorAddress_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."VendorOpenHours" DROP CONSTRAINT "VendorOpenHours_vendorId_fkey";

-- DropIndex
DROP INDEX "public"."User_username_key";

-- AlterTable
ALTER TABLE "public"."Menu" DROP COLUMN "vendorId",
ADD COLUMN     "businessId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "username",
DROP COLUMN "vendorId",
ADD COLUMN     "phoneNumber" TEXT;

-- DropTable
DROP TABLE "public"."Vendor";

-- DropTable
DROP TABLE "public"."VendorAddress";

-- DropTable
DROP TABLE "public"."VendorOpenHours";

-- DropEnum
DROP TYPE "public"."VendorStatus";

-- DropEnum
DROP TYPE "public"."VendorType";

-- CreateTable
CREATE TABLE "public"."Business" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessPhone" TEXT NOT NULL,
    "streetAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipcode" TEXT NOT NULL,
    "customSubdomain" TEXT NOT NULL,
    "open24_7" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusinessHours" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "dayOfWeek" "public"."DayOfWeek" NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_ownerUserId_key" ON "public"."Business"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_customSubdomain_key" ON "public"."Business"("customSubdomain");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHours_businessId_dayOfWeek_key" ON "public"."BusinessHours"("businessId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "public"."Business" ADD CONSTRAINT "Business_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusinessHours" ADD CONSTRAINT "BusinessHours_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Menu" ADD CONSTRAINT "Menu_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
