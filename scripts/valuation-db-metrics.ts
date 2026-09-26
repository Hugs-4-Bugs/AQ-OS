// Read-only inspection of dev DB for verifiable business metrics
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const out: Record<string, number> = {}

  const count = async (model: string) => {
    try {
      // @ts-expect-error dynamic
      return await db[model].count()
    } catch {
      return -1 // table missing
    }
  }

  const models = [
    'user', 'lead', 'deal', 'communication', 'leadActivity', 'workflow',
    'workflowExecution', 'subscription', 'payment', 'invoice', 'creditTransaction',
    'notification', 'message', 'apiKey', 'organization', 'insight', 'contact',
    'meeting', 'campaign', 'discovery', 'report', 'feedback', 'document'
  ]

  for (const m of models) {
    out[m] = await count(m)
  }
  console.log(JSON.stringify(out, null, 2))

  // User detail
  try {
    const users = await db.user.findMany({
      select: { email: true, name: true, createdAt: true, emailVerified: true, role: true },
      orderBy: { createdAt: 'asc' }
    })
    console.log('USERS:', JSON.stringify(users, null, 2))
  } catch (e) {
    console.log('USER_DETAIL_ERR:', (e as Error).message.slice(0, 300))
  }

  // Subscriptions/payments detail
  try {
    const subs = await db.subscription.findMany({
      select: { plan: true, status: true, userId: true, createdAt: true }
    })
    console.log('SUBSCRIPTIONS:', JSON.stringify(subs, null, 2))
  } catch (e) {
    console.log('SUB_ERR:', (e as Error).message.slice(0, 300))
  }
  try {
    const pays = await db.payment.findMany({
      select: { amount: true, currency: true, status: true, provider: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    })
    console.log('PAYMENTS:', JSON.stringify(pays, null, 2))
  } catch (e) {
    console.log('PAY_ERR:', (e as Error).message.slice(0, 300))
  }
  try {
    const deals = await db.deal.findMany({
      select: { status: true, proposedPrice: true, finalPrice: true, createdAt: true }
    })
    console.log('DEALS:', JSON.stringify(deals, null, 2))
  } catch (e) {
    console.log('DEAL_ERR:', (e as Error).message.slice(0, 300))
  }
}

main().finally(() => db.$disconnect())
