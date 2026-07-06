/**
 * 포트폴리오 데모용 시드 스크립트. 운영 마이그레이션이 아니라 1회성 수동 실행 도구다.
 * 실행: pnpm exec ts-node --transpile-only prisma/demo-seed.ts (DATABASE_URL 환경변수 필요)
 */
import { PrismaClient, ProductStatus, SellerStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('demo1234!', 10);

  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@demo.doa.market' },
    update: {},
    create: {
      email: 'buyer@demo.doa.market',
      password,
      name: '데모 구매자',
    },
  });

  const sellerUser = await prisma.user.upsert({
    where: { email: 'seller@demo.doa.market' },
    update: {},
    create: {
      email: 'seller@demo.doa.market',
      password,
      name: '데모 판매자',
    },
  });

  const seller = await prisma.seller.upsert({
    where: { userId: sellerUser.id },
    update: { status: SellerStatus.APPROVED },
    create: {
      userId: sellerUser.id,
      businessName: 'DOA 데모 스토어',
      businessNumber: '000-00-00000',
      representativeName: '데모 대표',
      status: SellerStatus.APPROVED,
    },
  });

  const categories = await Promise.all(
    ['의류', '전자기기', '홈리빙'].map((name, i) =>
      prisma.category.upsert({
        where: { slug: `demo-${i}` },
        update: {},
        create: { name, slug: `demo-${i}`, displayOrder: i },
      }),
    ),
  );

  const products = [
    { title: '데모 후드티', price: '39000', categoryIdx: 0 },
    { title: '데모 무선 이어폰', price: '89000', categoryIdx: 1 },
    { title: '데모 디퓨저', price: '25000', categoryIdx: 2 },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { title: p.title, sellerId: seller.id } });
    if (existing) continue;

    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: categories[p.categoryIdx].id,
        title: p.title,
        description: `${p.title} — 포트폴리오 데모용 샘플 상품입니다.`,
        price: p.price,
        status: ProductStatus.ACTIVE,
      },
    });

    const variant = await prisma.variant.create({
      data: {
        productId: product.id,
        optionName: '기본',
        optionValue: '단일',
        sku: `${product.id}-DEFAULT`,
        price: p.price,
      },
    });

    await prisma.inventory.create({
      data: { variantId: variant.id, productId: product.id, quantity: 50 },
    });
  }

  console.log('Demo seed complete:', {
    buyer: buyer.email,
    seller: sellerUser.email,
    products: products.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
