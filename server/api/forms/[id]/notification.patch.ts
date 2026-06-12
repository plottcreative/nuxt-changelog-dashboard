// server/api/forms/[id]/notification.patch.ts
import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { ObjectId } from 'mongodb'
import { getDb } from '../../../utils/mongo'
import { requireRole } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['user', 'manager', 'admin'])

  const formLogId = getRouterParam(event, 'id')
  if (!formLogId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing form log ID' })
  }

  const body = await readBody(event).catch(() => ({}))
  const { notificationRecipient, notificationDate } = body

  const db = await getDb()
  const formLogsCol = db.collection('form_logs')

  // Prepare update object
  const updateData: any = {}

  if (notificationRecipient !== undefined) {
    updateData.notificationRecipient = notificationRecipient || null
  }

  if (notificationDate !== undefined) {
    if (notificationDate) {
      // Convert to ISO string if it's a valid date
      const date = new Date(notificationDate)
      updateData.notificationDate = date.toISOString()
    }
    else {
      updateData.notificationDate = null
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields to update' })
  }

  try {
    const result = await formLogsCol.updateOne(
      { _id: new ObjectId(formLogId) },
      { $set: updateData },
    )

    if (result.matchedCount === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Form log not found' })
    }

    return {
      success: true,
      updated: updateData,
      message: 'Notification data updated successfully',
    }
  }
  catch (error) {
    if (error.statusCode) throw error

    console.error('Failed to update notification data:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update notification data',
    })
  }
})
