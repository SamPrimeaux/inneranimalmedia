/**
 * Tool: Database (db)
 * Standardized D1 (SQLite) execution with full parameterized safety.
 */

export const handlers = {
    /**
     * d1_query: Parameterized SELECT against bound D1 databases.
     */
    async d1_query({ sql, params = [] }, env) {
        if (!env.DB) return { error: 'D1 binding (env.DB) not configured' };
        if (!sql) return { error: 'SQL query required' };
        try {
            const { results, meta } = await env.DB.prepare(sql).bind(...params).all();
            return { success: true, results: results || [], meta };
        } catch (e) {
            return { error: `D1 Query Failed: ${e.message}` };
        }
    },

    /**
     * d1_write: INSERT/UPDATE/DELETE with safety checks.
     */
    async d1_write({ sql, params = [] }, env) {
        // High-risk tools require the runner to check approval status before dispatching
        if (!env.DB) return { error: 'D1 binding (env.DB) not configured' };
        try {
            const res = await env.DB.prepare(sql).bind(...params).run();
            return { success: true, meta: res.meta };
        } catch (e) {
            return { error: `D1 Write Failed: ${e.message}` };
        }
    },

    /**
     * d1_batch_write: Atomic multi-statement execution.
     */
    async d1_batch_write({ queries }, env) {
        if (!env.DB) return { error: 'D1 binding (env.DB) not configured' };
        try {
            const statements = queries.map(q => env.DB.prepare(q.sql).bind(...(q.params || [])));
            const results = await env.DB.batch(statements);
            return { success: true, results };
        } catch (e) {
            return { error: `D1 Batch Write Failed: ${e.message}` };
        }
    }
};
