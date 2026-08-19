/**
 * NAVBAT — development seed.
 *
 * Yaratadi:
 *   10 foydalanuvchi (5 buyurtmachi + 5 navbatchi, 1 admin)
 *   15 buyurtma (turli statuslarda)
 *   5+ bo'sh vaqt yozuvi
 *   10 reyting
 *   tranzaksiyalar, 3 nizo, 3 pul yechish so'rovi
 *
 * Ishga tushirish: npm run db:seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { calculatePrice, ratingToInt } from '@navbat/shared';

const FEE_PERCENT = Number.parseInt(process.env.PLATFORM_FEE_PERCENT ?? '10', 10);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

function dayOffset(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Toshkent tumanlari — demo koordinatalari */
const PLACES = {
  chilonzor: { name: 'Chilonzor', lat: 41.2756, lon: 69.2034 },
  yunusobod: { name: 'Yunusobod', lat: 41.3651, lon: 69.2895 },
  mirzoUlugbek: { name: 'Mirzo Ulug‘bek', lat: 41.3386, lon: 69.3344 },
  sergeli: { name: 'Sergeli', lat: 41.2242, lon: 69.2202 },
  yakkasaroy: { name: 'Yakkasaroy', lat: 41.2856, lon: 69.2536 },
};

interface SeedUser {
  telegramId: number;
  firstName: string;
  lastName?: string;
  username: string;
  roleMode: 'BUYER' | 'WORKER' | 'BOTH';
  rating: number;
  completed: number;
  cancelled: number;
  balance: number;
  earned: number;
  spent: number;
  isAdmin?: boolean;
}

const USERS: SeedUser[] = [
  // --- buyurtmachilar
  {
    telegramId: 100000001,
    firstName: 'Abdulaziz',
    lastName: 'Karimov',
    username: 'abdulaziz',
    roleMode: 'BOTH',
    rating: 4.8,
    completed: 12,
    cancelled: 1,
    balance: 0,
    earned: 0,
    spent: 640000,
    isAdmin: true,
  },
  { telegramId: 100000002, firstName: 'Dilnoza', lastName: 'Rasulova', username: 'dilnoza', roleMode: 'BUYER', rating: 4.9, completed: 7, cancelled: 0, balance: 20000, earned: 0, spent: 385000 },
  { telegramId: 100000003, firstName: 'Sardor', lastName: 'Umarov', username: 'sardor_u', roleMode: 'BUYER', rating: 4.6, completed: 4, cancelled: 1, balance: 0, earned: 0, spent: 220000 },
  { telegramId: 100000004, firstName: 'Nilufar', lastName: 'Yo‘ldosheva', username: 'nilufar', roleMode: 'BUYER', rating: 5.0, completed: 3, cancelled: 0, balance: 55000, earned: 0, spent: 165000 },
  { telegramId: 100000005, firstName: 'Jasur', lastName: 'Toshmatov', username: 'jasur_t', roleMode: 'BOTH', rating: 4.4, completed: 5, cancelled: 2, balance: 30000, earned: 120000, spent: 190000 },
  // --- navbatchilar
  { telegramId: 100000006, firstName: 'Ali', lastName: 'Yusupov', username: 'ali_y', roleMode: 'WORKER', rating: 4.9, completed: 47, cancelled: 1, balance: 280000, earned: 1280000, spent: 0 },
  { telegramId: 100000007, firstName: 'Malika', lastName: 'Ergasheva', username: 'malika_e', roleMode: 'WORKER', rating: 4.7, completed: 23, cancelled: 2, balance: 145000, earned: 690000, spent: 0 },
  { telegramId: 100000008, firstName: 'Bekzod', lastName: 'Normatov', username: 'bekzod_n', roleMode: 'WORKER', rating: 4.5, completed: 15, cancelled: 3, balance: 60000, earned: 430000, spent: 0 },
  { telegramId: 100000009, firstName: 'Shahnoza', lastName: 'Qodirova', username: 'shahnoza', roleMode: 'WORKER', rating: 5.0, completed: 9, cancelled: 0, balance: 90000, earned: 315000, spent: 0 },
  { telegramId: 100000010, firstName: 'Rustam', lastName: 'Ismoilov', username: 'rustam_i', roleMode: 'WORKER', rating: 4.2, completed: 6, cancelled: 2, balance: 15000, earned: 175000, spent: 0 },
];

async function reset() {
  // FK bog'liqliklari tartibida tozalash
  await prisma.checkIn.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.message.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.order.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log('[seed] tozalanmoqda...');
  await reset();

  console.log('[seed] foydalanuvchilar...');
  const users = new Map<string, { id: string; firstName: string }>();
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: {
        telegramId: BigInt(u.telegramId),
        firstName: u.firstName,
        lastName: u.lastName ?? null,
        username: u.username,
        isAdmin: u.isAdmin ?? false,
        profile: {
          create: {
            roleMode: u.roleMode,
            onboarded: true,
            rating: ratingToInt(u.rating),
            ratingCount: u.completed,
            completedOrders: u.completed,
            cancelledOrders: u.cancelled,
            availableBalance: u.balance,
            totalEarned: u.earned,
            totalSpent: u.spent,
            city: 'Toshkent',
          },
        },
      },
    });
    users.set(u.username, { id: created.id, firstName: created.firstName });
  }

  const abdulaziz = users.get('abdulaziz')!;
  const ali = users.get('ali_y')!;
  const dilnoza = users.get('dilnoza')!;
  const sardor = users.get('sardor_u')!;
  const nilufar = users.get('nilufar')!;
  const jasur = users.get('jasur_t')!;
  const malika = users.get('malika_e')!;
  const bekzod = users.get('bekzod_n')!;
  const shahnoza = users.get('shahnoza')!;
  const rustam = users.get('rustam_i')!;

  console.log('[seed] bo‘sh vaqtlar...');
  const availabilities = [
    { worker: ali, days: 3, start: '13:30', end: '17:00', place: PLACES.chilonzor, radius: 5, min: 30000 },
    { worker: malika, days: 3, start: '09:00', end: '13:00', place: PLACES.yunusobod, radius: 5, min: 25000 },
    { worker: bekzod, days: 4, start: '10:00', end: '18:00', place: PLACES.sergeli, radius: 10, min: 20000 },
    { worker: shahnoza, days: 3, start: '08:00', end: '12:00', place: PLACES.mirzoUlugbek, radius: 3, min: 40000 },
    { worker: rustam, days: 5, start: '14:00', end: '20:00', place: PLACES.yakkasaroy, radius: 7, min: 15000 },
    { worker: jasur, days: 3, start: '15:00', end: '19:00', place: PLACES.chilonzor, radius: 5, min: 35000 },
  ];
  for (const a of availabilities) {
    await prisma.availability.create({
      data: {
        workerId: a.worker.id,
        date: dayOffset(a.days),
        startTime: a.start,
        endTime: a.end,
        locationName: a.place.name,
        latitude: a.place.lat,
        longitude: a.place.lon,
        radiusKm: a.radius,
        minimumAmount: a.min,
      },
    });
  }

  console.log('[seed] buyurtmalar...');

  interface OrderSpec {
    buyer: { id: string; firstName: string };
    worker?: { id: string; firstName: string };
    category: 'DOCTOR' | 'GOVERNMENT' | 'DOCUMENTS' | 'BANK' | 'CONSULATE' | 'SHOP' | 'EVENT' | 'OTHER';
    title: string;
    description: string;
    place: { name: string; lat: number; lon: number };
    locationName: string;
    address: string;
    days: number;
    start: string;
    end: string;
    amount: number;
    status:
      | 'PUBLISHED'
      | 'MATCHED'
      | 'IN_PROGRESS'
      | 'COMPLETION_PENDING'
      | 'COMPLETED'
      | 'CANCELLED'
      | 'DISPUTED';
    rate?: { buyerStars: number; workerStars: number; comment?: string };
    dispute?: { reason: 'WORKER_NO_SHOW' | 'WORKER_LATE' | 'TASK_NOT_DONE' | 'WRONG_PLACE' | 'OTHER'; description: string };
  }

  const specs: OrderSpec[] = [
    // --- DEMO SSENARIY (README'dagi): Abdulaziz -> Ali, Chilonzor kardiolog
    {
      buyer: abdulaziz,
      category: 'DOCTOR',
      title: 'Kardiolog navbati',
      description: '2-qavat, 214-xona. Navbat raqamini olib turing.',
      place: PLACES.chilonzor,
      locationName: 'Chilonzor poliklinikasi',
      address: 'Chilonzor tumani, Bunyodkor ko‘chasi 12',
      days: 3,
      start: '14:30',
      end: '16:00',
      amount: 50000,
      status: 'PUBLISHED',
    },
    // --- ochiq (PUBLISHED) topshiriqlar
    { buyer: dilnoza, category: 'GOVERNMENT', title: 'Davlat xizmatlari markazi', description: 'Pasport bo‘limi, 3-oyna.', place: PLACES.yunusobod, locationName: 'Yunusobod DXM', address: 'Yunusobod, Amir Temur 108', days: 3, start: '09:30', end: '12:00', amount: 45000, status: 'PUBLISHED' },
    { buyer: sardor, category: 'BANK', title: 'Bank navbati', description: 'Kredit bo‘limi.', place: PLACES.sergeli, locationName: 'Sergeli bank filiali', address: 'Sergeli, Yangi Sergeli 4', days: 4, start: '11:00', end: '14:00', amount: 35000, status: 'PUBLISHED' },
    { buyer: nilufar, category: 'CONSULATE', title: 'Konsullik navbati', description: 'Viza hujjatlarini topshirish uchun navbat.', place: PLACES.mirzoUlugbek, locationName: 'Konsullik bo‘limi', address: 'Mirzo Ulug‘bek, Buyuk Ipak Yo‘li 77', days: 3, start: '08:30', end: '11:00', amount: 80000, status: 'PUBLISHED' },
    { buyer: jasur, category: 'DOCUMENTS', title: 'Notarius navbati', description: 'Ishonchnoma rasmiylashtirish.', place: PLACES.yakkasaroy, locationName: 'Yakkasaroy notarius', address: 'Yakkasaroy, Shota Rustaveli 23', days: 5, start: '15:00', end: '18:00', amount: 40000, status: 'PUBLISHED' },
    { buyer: dilnoza, category: 'SHOP', title: 'Do‘kon aksiyasi navbati', description: 'Yangi telefon chiqishi kuni.', place: PLACES.chilonzor, locationName: 'Chilonzor savdo markazi', address: 'Chilonzor, Bunyodkor 45', days: 6, start: '07:00', end: '10:00', amount: 60000, status: 'PUBLISHED' },
    // --- MATCHED
    { buyer: sardor, worker: malika, category: 'DOCTOR', title: 'Nevropatolog navbati', description: '1-qavat, 105-xona.', place: PLACES.yunusobod, locationName: 'Yunusobod poliklinikasi', address: 'Yunusobod, Bog‘ishamol 15', days: 3, start: '10:00', end: '12:30', amount: 45000, status: 'MATCHED' },
    { buyer: nilufar, worker: bekzod, category: 'GOVERNMENT', title: 'Soliq inspeksiyasi', description: 'Hisobot topshirish.', place: PLACES.sergeli, locationName: 'Sergeli soliq bo‘limi', address: 'Sergeli, Quruvchilar 8', days: 4, start: '10:30', end: '13:00', amount: 38000, status: 'MATCHED' },
    // --- IN_PROGRESS
    { buyer: abdulaziz, worker: rustam, category: 'DOCUMENTS', title: 'Arxiv ma’lumotnomasi', description: 'Ma’lumotnoma olish uchun navbat.', place: PLACES.yakkasaroy, locationName: 'Davlat arxivi', address: 'Yakkasaroy, Nukus 44', days: 0, start: '09:00', end: '13:00', amount: 42000, status: 'IN_PROGRESS' },
    // --- COMPLETION_PENDING
    { buyer: dilnoza, worker: shahnoza, category: 'BANK', title: 'Bank kartasi olish', description: 'Yangi karta rasmiylashtirish.', place: PLACES.mirzoUlugbek, locationName: 'Mirzo Ulug‘bek bank', address: 'Mirzo Ulug‘bek, Mustaqillik 2', days: 0, start: '09:00', end: '11:00', amount: 30000, status: 'COMPLETION_PENDING' },
    // --- COMPLETED (reytinglar bilan)
    { buyer: abdulaziz, worker: ali, category: 'DOCTOR', title: 'LOR shifokor navbati', description: '', place: PLACES.chilonzor, locationName: 'Chilonzor poliklinikasi', address: 'Chilonzor, Bunyodkor 12', days: -7, start: '10:00', end: '12:00', amount: 45000, status: 'COMPLETED', rate: { buyerStars: 5, workerStars: 5, comment: 'Juda tez va aniq ishladi. Rahmat!' } },
    { buyer: dilnoza, worker: ali, category: 'GOVERNMENT', title: 'Kadastr bo‘limi', description: '', place: PLACES.yunusobod, locationName: 'Kadastr xizmati', address: 'Yunusobod, Amir Temur 120', days: -5, start: '09:00', end: '12:00', amount: 55000, status: 'COMPLETED', rate: { buyerStars: 5, workerStars: 4, comment: 'Vaqtida yetib keldi.' } },
    { buyer: sardor, worker: malika, category: 'DOCUMENTS', title: 'Guvohnoma topshirish', description: '', place: PLACES.yunusobod, locationName: 'DXM', address: 'Yunusobod, Amir Temur 108', days: -4, start: '11:00', end: '13:00', amount: 35000, status: 'COMPLETED', rate: { buyerStars: 4, workerStars: 5, comment: 'Yaxshi.' } },
    { buyer: nilufar, worker: shahnoza, category: 'EVENT', title: 'Konsert chiptasi navbati', description: '', place: PLACES.mirzoUlugbek, locationName: 'Konsert zali kassasi', address: 'Mirzo Ulug‘bek, Buyuk Ipak Yo‘li 5', days: -3, start: '08:00', end: '10:00', amount: 65000, status: 'COMPLETED', rate: { buyerStars: 5, workerStars: 5 } },
    { buyer: jasur, worker: bekzod, category: 'OTHER', title: 'Texnik ko‘rik navbati', description: '', place: PLACES.sergeli, locationName: 'Texko‘rik markazi', address: 'Sergeli, Yangi Sergeli 19', days: -2, start: '08:00', end: '11:00', amount: 50000, status: 'COMPLETED', rate: { buyerStars: 3, workerStars: 4, comment: 'Biroz kechikdi.' } },
    // --- DISPUTED
    { buyer: sardor, worker: rustam, category: 'DOCTOR', title: 'Stomatolog navbati', description: '', place: PLACES.yakkasaroy, locationName: 'Yakkasaroy stomatologiya', address: 'Yakkasaroy, Shota Rustaveli 8', days: -1, start: '14:00', end: '16:00', amount: 40000, status: 'DISPUTED', dispute: { reason: 'WORKER_LATE', description: 'Navbatchi 40 daqiqa kech keldi, navbat o‘tib ketdi.' } },
    // --- CANCELLED
    { buyer: jasur, category: 'SHOP', title: 'Elektronika do‘koni navbati', description: '', place: PLACES.chilonzor, locationName: 'Malika savdo markazi', address: 'Chilonzor, Qatortol 3', days: -6, start: '09:00', end: '11:00', amount: 25000, status: 'CANCELLED' },
  ];

  // Demo platforma kartasi — bo'lmasa to'lov oqimi ishga tushmaydi
  for (const [key, value] of [
    ['payout.card_number', '8600123412341234'],
    ['payout.card_holder', 'NAVBAT DEMO'],
    ['payout.card_bank', 'Demo Bank'],
  ] as const) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  let created = 0;
  for (const spec of specs) {
    const price = calculatePrice(spec.amount, FEE_PERCENT);
    const isPaid = spec.status !== 'CANCELLED';
    const isReleased = spec.status === 'COMPLETED';

    const order = await prisma.order.create({
      data: {
        buyerId: spec.buyer.id,
        category: spec.category,
        title: spec.title,
        description: spec.description || null,
        locationName: spec.locationName,
        address: spec.address,
        latitude: spec.place.lat,
        longitude: spec.place.lon,
        date: dayOffset(spec.days),
        startTime: spec.start,
        endTime: spec.end,
        offeredAmount: price.offeredAmount,
        platformFee: price.platformFee,
        workerAmount: price.workerAmount,
        totalAmount: price.totalAmount,
        status: spec.status,
        publishedAt: new Date(),
        payment: {
          create: {
            payerId: spec.buyer.id,
            receiverId: spec.worker?.id ?? null,
            grossAmount: price.totalAmount,
            platformFee: price.platformFee,
            workerAmount: price.workerAmount,
            status: isReleased ? 'RELEASED' : spec.status === 'CANCELLED' ? 'REFUNDED' : 'HELD',
            provider: 'card',
            transactionId: `ch_seed_${created}`,
            paidAt: new Date(),
            releasedAt: isReleased ? new Date() : null,
            refundedAt: spec.status === 'CANCELLED' ? new Date() : null,
          },
        },
      },
    });
    created += 1;

    if (spec.worker) {
      const startedAt =
        spec.status === 'IN_PROGRESS' ||
        spec.status === 'COMPLETION_PENDING' ||
        spec.status === 'COMPLETED' ||
        spec.status === 'DISPUTED'
          ? new Date(Date.now() - 90 * 60 * 1000)
          : null;
      const completedAt =
        spec.status === 'COMPLETION_PENDING' || spec.status === 'COMPLETED'
          ? new Date(Date.now() - 20 * 60 * 1000)
          : null;

      await prisma.assignment.create({
        data: {
          orderId: order.id,
          workerId: spec.worker.id,
          status: spec.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
          matchScore: 80 + (created % 20),
          startedAt,
          completedAt,
        },
      });

      if (startedAt) {
        await prisma.checkIn.create({
          data: {
            orderId: order.id,
            workerId: spec.worker.id,
            type: 'ARRIVAL',
            latitude: spec.place.lat + 0.001,
            longitude: spec.place.lon + 0.001,
            distanceM: 140,
          },
        });
      }

      // Escrowdagi pul navbatchining pending balansida turadi
      if (spec.status === 'MATCHED' || spec.status === 'IN_PROGRESS' || spec.status === 'COMPLETION_PENDING' || spec.status === 'DISPUTED') {
        await prisma.profile.update({
          where: { userId: spec.worker.id },
          data: { pendingBalance: { increment: price.workerAmount } },
        });
      }

      // Chat xabarlari
      await prisma.message.createMany({
        data: [
          {
            orderId: order.id,
            senderId: spec.buyer.id,
            body: 'Assalomu alaykum! Yetib borgach yozing.',
            type: 'TEXT',
          },
          {
            orderId: order.id,
            senderId: spec.worker.id,
            body: 'Va alaykum assalom. Xo‘p bo‘ladi.',
            type: 'TEXT',
          },
        ],
      });
    }

    if (isReleased && spec.worker) {
      await prisma.transaction.create({
        data: {
          userId: spec.worker.id,
          orderId: order.id,
          type: 'TASK_INCOME',
          amount: price.workerAmount,
          balanceAfter: price.workerAmount,
          note: spec.title,
        },
      });
      await prisma.transaction.create({
        data: {
          userId: spec.buyer.id,
          orderId: order.id,
          type: 'ORDER_PAYMENT',
          amount: -price.workerAmount,
          balanceAfter: 0,
          note: spec.title,
        },
      });
      await prisma.transaction.create({
        data: {
          userId: spec.buyer.id,
          orderId: order.id,
          type: 'PLATFORM_FEE',
          amount: -price.platformFee,
          balanceAfter: 0,
          note: 'Platforma xizmat haqi',
        },
      });
    }

    if (spec.rate && spec.worker) {
      await prisma.rating.create({
        data: {
          orderId: order.id,
          fromUserId: spec.buyer.id,
          toUserId: spec.worker.id,
          rating: spec.rate.buyerStars,
          comment: spec.rate.comment ?? null,
        },
      });
      await prisma.rating.create({
        data: {
          orderId: order.id,
          fromUserId: spec.worker.id,
          toUserId: spec.buyer.id,
          rating: spec.rate.workerStars,
          comment: null,
        },
      });
    }

    if (spec.dispute) {
      await prisma.dispute.create({
        data: {
          orderId: order.id,
          openedById: spec.buyer.id,
          reason: spec.dispute.reason,
          description: spec.dispute.description,
          status: 'OPEN',
        },
      });
    }
  }

  // Qo'shimcha nizolar (jami 3 ta)
  const completedOrders = await prisma.order.findMany({
    where: { status: 'COMPLETED' },
    take: 2,
    include: { assignments: true },
  });
  for (const [i, o] of completedOrders.entries()) {
    await prisma.dispute.create({
      data: {
        orderId: o.id,
        openedById: o.buyerId,
        reason: i === 0 ? 'TASK_NOT_DONE' : 'OTHER',
        description: i === 0 ? 'Navbat raqami noto‘g‘ri olingan edi.' : 'Qo‘shimcha savol bor.',
        status: i === 0 ? 'RESOLVED_WORKER' : 'RESOLVED_BUYER',
        resolution: i === 0 ? 'Navbatchi foydasiga hal qilindi.' : 'Buyurtmachiga qaytarildi.',
        resolvedAt: new Date(),
      },
    });
  }

  console.log('[seed] pul yechish so‘rovlari...');
  await prisma.withdrawal.createMany({
    data: [
      { workerId: ali.id, amount: 200000, method: 'CARD', account: '8600 **** **** 1234', status: 'COMPLETED' },
      { workerId: malika.id, amount: 100000, method: 'CLICK', account: '+998901234567', status: 'PENDING' },
      { workerId: bekzod.id, amount: 50000, method: 'PAYME', account: '+998935556677', status: 'PROCESSING' },
    ],
  });

  console.log('[seed] tranzaksiyalar...');
  await prisma.transaction.createMany({
    data: [
      { userId: ali.id, type: 'WITHDRAWAL', amount: -200000, balanceAfter: 280000, note: 'Pul yechish (CARD)' },
      { userId: malika.id, type: 'WITHDRAWAL', amount: -100000, balanceAfter: 145000, note: 'Pul yechish (CLICK)' },
    ],
  });

  console.log('[seed] bildirishnomalar...');
  await prisma.notification.createMany({
    data: [
      { userId: abdulaziz.id, type: 'ORDER_CREATED', title: 'Buyurtma e’lon qilindi', body: 'Kardiolog navbati — 50 000 UZS. Navbatchi qidirilmoqda.' },
      { userId: ali.id, type: 'NEW_MATCHING_ORDER', title: 'Sizga mos yangi topshiriq', body: 'Shifokor — Chilonzor poliklinikasi · 50 000 UZS' },
      { userId: rustam.id, type: 'ORDER_ACCEPTED', title: 'Topshiriq qabul qilindi', body: 'Davlat arxivi · 09:00–13:00' },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    orders: await prisma.order.count(),
    availability: await prisma.availability.count(),
    assignments: await prisma.assignment.count(),
    payments: await prisma.payment.count(),
    ratings: await prisma.rating.count(),
    transactions: await prisma.transaction.count(),
    disputes: await prisma.dispute.count(),
    withdrawals: await prisma.withdrawal.count(),
    messages: await prisma.message.count(),
  };

  console.log('\n[seed] tayyor:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`\n  Demo buyurtmachi : Abdulaziz (telegram_id 100000001, admin)`);
  console.log(`  Demo navbatchi   : Ali (telegram_id 100000006)`);
  console.log(`  Demo sanasi      : ${dateStr(dayOffset(3))}\n`);
}

main()
  .catch((error) => {
    console.error('[seed] xatolik:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
