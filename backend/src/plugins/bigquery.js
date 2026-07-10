import fp from 'fastify-plugin'
import { BigQuery } from '@google-cloud/bigquery'

export default fp(async (fastify) => {
  const bq = new BigQuery({ projectId: process.env.BQ_PROJECT })
  const DATASET = process.env.BQ_DATASET || 'dcsmart_analytics'
  fastify.decorate('bq', bq)
  fastify.decorate('bqDataset', DATASET)
})
