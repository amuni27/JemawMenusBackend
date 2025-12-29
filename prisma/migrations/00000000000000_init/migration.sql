-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('VENUE', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."MenuVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."ItemStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "public"."SpiceLevel" AS ENUM ('NONE', 'MILD', 'MEDIUM', 'HOT', 'EXTRA_HOT');

-- CreateEnum
CREATE TYPE "public"."DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "public"."User" (
                                 "id" TEXT NOT NULL,
                                 "fullName" TEXT NOT NULL,
                                 "email" TEXT NOT NULL,
                                 "phoneNumber" TEXT,
                                 "passwordHash" TEXT NOT NULL,
                                 "role" "public"."UserRole" NOT NULL,
                                 "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
                                 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                 "updatedAt" TIMESTAMP(3) NOT NULL,
                                 "businessId" TEXT,

                                 CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "public"."MenuType" (
                                     "id" TEXT NOT NULL,
                                     "name" TEXT NOT NULL,
                                     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                     "updatedAt" TIMESTAMP(3) NOT NULL,

                                     CONSTRAINT "MenuType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Menu" (
                                 "id" TEXT NOT NULL,
                                 "businessId" TEXT NOT NULL,
                                 "menuTypeId" TEXT NOT NULL,
                                 "name" TEXT NOT NULL,
                                 "description" TEXT,
                                 "currency" TEXT NOT NULL DEFAULT 'USD',
                                 "isActive" BOOLEAN NOT NULL DEFAULT true,
                                 "visibility" "public"."MenuVisibility" NOT NULL,
                                 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                 "updatedAt" TIMESTAMP(3) NOT NULL,

                                 CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
                                     "id" TEXT NOT NULL,
                                     "menuId" TEXT NOT NULL,
                                     "name" TEXT NOT NULL,
                                     "sortOrder" INTEGER NOT NULL DEFAULT 0,
                                     "isActive" BOOLEAN NOT NULL DEFAULT true,
                                     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                     "updatedAt" TIMESTAMP(3) NOT NULL,

                                     CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItem" (
                                     "id" TEXT NOT NULL,
                                     "menuId" TEXT NOT NULL,
                                     "categoryId" TEXT NOT NULL,
                                     "name" TEXT NOT NULL,
                                     "description" TEXT,
                                     "price" DECIMAL(10,2) NOT NULL,
                                     "calories" INTEGER,
                                     "imageUrl" TEXT,
                                     "ingredients" JSONB NOT NULL,
                                     "allergens" JSONB,
                                     "tags" JSONB,
                                     "status" "public"."ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
                                     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
                                     "prepTimeMinutes" INTEGER,
                                     "spiceLevel" "public"."SpiceLevel",
                                     "sortOrder" INTEGER NOT NULL DEFAULT 0,
                                     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                     "updatedAt" TIMESTAMP(3) NOT NULL,

                                     CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QRTable" (
                                    "id" TEXT NOT NULL,
                                    "menuId" TEXT NOT NULL,
                                    "label" TEXT NOT NULL,
                                    "code" TEXT NOT NULL,
                                    "isActive" BOOLEAN NOT NULL DEFAULT true,
                                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                    "updatedAt" TIMESTAMP(3) NOT NULL,

                                    CONSTRAINT "QRTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Business_ownerUserId_key" ON "public"."Business"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_customSubdomain_key" ON "public"."Business"("customSubdomain");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHours_businessId_dayOfWeek_key" ON "public"."BusinessHours"("businessId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "MenuType_name_key" ON "public"."MenuType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "QRTable_code_key" ON "public"."QRTable"("code");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Business" ADD CONSTRAINT "Business_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusinessHours" ADD CONSTRAINT "BusinessHours_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Menu" ADD CONSTRAINT "Menu_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Menu" ADD CONSTRAINT "Menu_menuTypeId_fkey" FOREIGN KEY ("menuTypeId") REFERENCES "public"."MenuType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Category" ADD CONSTRAINT "Category_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "public"."Menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "public"."Menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QRTable" ADD CONSTRAINT "QRTable_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "public"."Menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
