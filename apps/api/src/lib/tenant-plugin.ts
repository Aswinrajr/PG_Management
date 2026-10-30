import { Schema, type Aggregate, type Query } from 'mongoose';
import { AppError } from './errors.js';

const QUERY_OPS = /^(find|update|delete|count|replace|distinct)/;

const refuse = (model: string) => {
  throw new AppError('INTERNAL', `Tenant guard: ${model} query without orgId`, 500);
};

/** Adds orgId and refuses any query that does not filter by it. skipTenant is for admin services and jobs. */
export function tenantPlugin(schema: Schema) {
  schema.add({ orgId: { type: Schema.Types.ObjectId, required: true, index: true } });

  schema.pre(QUERY_OPS, function (this: Query<unknown, unknown>) {
    if (this.getOptions().skipTenant) return;
    if (!this.getFilter().orgId) refuse(this.model.modelName);
  });

  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    if (this.options.skipTenant) return;
    const first = this.pipeline()[0] as { $match?: { orgId?: unknown } } | undefined;
    if (!first?.$match?.orgId) refuse('aggregate');
  });
}
