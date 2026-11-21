# Báo cáo thẩm định lần 4 — BPNM Doc Hub (PR #8, D1–D5)

> **Gửi reviewer (ChatGPT):** Đây là báo cáo tự chứa để thẩm định PR #8. Hãy kiểm tra từng lỗi D1–D5
> và các mục "Nên sửa" theo bảng và đoạn mã dưới đây, tìm lỗ hổng còn sót (nhất là các khoảng `await`,
> đa worker, migration trên dữ liệu Production cũ), rồi kết luận **GO / NO-GO** kèm danh sách lỗi chặn
> và nên sửa (nếu có). Bên thực hiện không tự tuyên bố GO.

## 1. Thông tin chung
| Mục | Giá trị |
|---|---|
| Repository | `Xichlo1234/bpnm-doc-hub` (private) |
| PR cần thẩm định | https://github.com/Xichlo1234/bpnm-doc-hub/pull/8 — `pr08-final-review-fixes` → `pr07-final-hardening` |
| Commit mã cuối | `2a0e908551af4ce9e4ad76a669e43fe7e911735a` |
| Nhánh tích hợp (PR #1 → #8) | `claude/vigilant-babbage-xm8dcm` |
| Lịch sử thẩm định | Lần 1 NO-GO (B1–B6) → PR #6 · Lần 2 NO-GO (C1–C7) → PR #7 · Lần 3 NO-GO (D1–D5) → **PR #8** |
| Công nghệ | Cloudflare Workers + Hono, D1 (SQLite), R2, React 18 + Vite, TypeScript, vitest |
| Production | **Không** deploy, **không** migrate, **không** đọc/ghi. Chưa merge PR nào, không force-push. |

Mô hình dữ liệu cần biết khi đọc mã: mỗi isolate giữ bộ đệm `MemoryStore` của toàn bộ bảng; `flush()` ghi
các hàng thay đổi trong **một batch D1** kèm các câu lệnh "guard" (bảng có `CHECK` luôn sai) để huỷ cả batch khi
revision trong D1 khác revision đã đọc, khi số nghiệp vụ đã có chủ (`number_registry`), hoặc khi tệp đã bị thu hồi.
Lỗi guard → `RevisionConflictError` (409); bộ đệm bị đánh dấu `stale` và nạp lại.

## 2. Lỗi → Mã đã sửa → Test → Kết quả
Test chính: `tests/pr08_hardening.test.ts` (25 test).

| Lỗi | Mã đã sửa | Test | Kết quả |
|---|---|---|---|
| **D1** Trùng mã đối tác giữa các worker | `migrations/0010_partner_code_unique.sql` (UNIQUE ở D1); `routes/partners.ts` (`normalizePartnerCode`: NFC, trim, gộp khoảng trắng, in hoa; kiểm tra khi tạo/sửa); `routes/trash.ts` (khôi phục); `db/repository.ts` (`PartnerCodeTakenError`); `index.ts` → **409 `PARTNER_CODE_TAKEN`**; id đối tác ngẫu nhiên; preflight chặn khi dữ liệu đang trùng | Hai worker (2 kết nối SQLite + 2 `MemoryStore` trên một tệp DB): tạo/tạo, tạo/khôi phục, khôi phục/khôi phục → worker sau nhận `PartnerCodeTakenError`, D1 chỉ còn 1 đối tác hoạt động; API 409; `tests/migrations.test.ts` › 0010 trên DB giả lập Production | ✔ |
| **D2** Đăng nhập cấp token từ lần xác thực trước khi nạp lại | `routes/auth.ts`: tối đa 2 lượt; mỗi lượt xác thực mật khẩu + trạng thái trên dữ liệu hiện tại; sau mọi `await` kiểm tra lại mật khẩu/trạng thái/revision; `RevisionConflictError` → `sync` rồi xác thực lại từ đầu; hết lượt → **409 `LOGIN_RETRY`**, không token. Giữ nâng cấp hash cũ và bắt buộc đổi mật khẩu mặc định | Hai worker: đăng nhập vs đặt lại mật khẩu → 401 (mật khẩu mới dùng được); vs khoá → 403; vs thu hồi phiên → token mang `token_version` mới nhất. **Cùng isolate:** đặt lại mật khẩu / khoá xảy ra trong lúc `verifyPassword` đang chạy → không có token | ✔ |
| **D3** Hai request cùng isolate cùng `expected_revision` | Kiểm tra lại revision/số **ngay trước khi sửa bộ đệm, sau mọi `await`** (upload R2, kiểm tra quyền tệp, băm mật khẩu): `routes/attachments.ts`, `contracts.ts`, `documents.ts`, `users.ts`. Bên thua `rollback()` tệp vừa upload (chưa từng gắn, khoá duy nhất) + 409. `store.persistAsync` ném `RevisionConflictError` nếu bộ đệm bị huỷ | `Promise.all` 2 request, chèn trễ tại `await`: thêm phiên bản tệp; sửa hợp đồng lao động qua kiểm tra quyền tệp; đặt lại mật khẩu; tạo văn bản cùng số kèm tệp → **1 thành công + 1 409**, đúng 1 tệp và 1 hàng `file_uploads` mới. Commit lỗi sau upload → 500, không có hàng `file_uploads`, tệp dùng chung còn nguyên | ✔ |
| **D4** Nhập Excel nhận sai văn bản | `utils/importer.ts` `matchRow`: theo id hợp lệ (id thuộc sổ khác → lỗi) hoặc `(doc_type, số chuẩn hoá)`; không có `doc_type` mà số có ở nhiều sổ → lỗi rõ; `db/store.ts` `bulkUpsertDocuments` dùng cùng quy tắc; kiểm tra số theo sổ số | Cùng số ở sổ đến và đi: xem trước + ghi chỉ cập nhật đúng sổ; dòng mơ hồ → lỗi (xem trước) và 400 (ghi); dòng sổ khác → tạo mới, không gộp; id khác sổ → lỗi; dữ liệu lịch sử | ✔ |
| **D5** Khoá ghi trước migration | `docs/ops/DEPLOY_RUNBOOK.md` viết lại 7 bước (mục 3); `wrangler.jsonc` `vars.MAINTENANCE_MODE = "0"`; middleware bảo trì chạy trước mọi truy cập DB | Bảo trì trả 503 cho `/api/*` (kể cả login, upload) **không gọi `getDatabase`**, `/api/health` 200; runbook: khoá ghi đứng trước lệnh migrate, mở ghi đứng sau; dry-run có/không `--var MAINTENANCE_MODE:1` cùng bộ binding | ✔ |
| Nên sửa: luồng nghiệp vụ | `utils/documentRules.ts`: đổi người xử lý/người ký/loại văn bản mà không đổi trạng thái vẫn kiểm tra yêu cầu bước hiện tại và trạng thái hợp lệ với loại mới | Xoá người xử lý ở "Đã phân công" → `TRANSITION_FIELD_REQUIRED`; đổi loại → `STATUS_INVALID` | ✔ |
| Nên sửa: Excel giữ trường | Xuất → nhập lại không thay đổi; cột mở rộng được giữ; dòng thiếu cột không làm rỗng trường khác | Round trip | ✔ |
| Nên sửa: revision trả về | API sửa tài khoản/đối tác trả revision đã commit | So với D1 | ✔ |
| Nên sửa: tồn đọng `storage_cleanup` | `cleanupCounts`, `listCleanup(limit, offset)`; `GET /api/admin/storage-cleanup?status&limit&offset`; POST trả `remaining` | Tổng số + phân trang | ✔ |
| Nên sửa: preflight sổ số | Số trùng lịch sử (trước backfill) → cảnh báo; `registry_conflicts` (số đã đăng ký cho hồ sơ khác, phát sinh sau backfill) → **CHẶN**; `unregistered_numbers` → cảnh báo + reconcile | Lịch sử không chặn; bản cũ ghi trùng sau backfill → chặn | ✔ |
| Nên sửa: hồi quy | Văn bản Mật, R2, đính kèm, nhật ký, thông báo, sổ số | Toàn bộ test cũ (359 test) | ✔ |

## 3. Runbook D5 — khoá ghi trước migration (tóm tắt `docs/ops/DEPLOY_RUNBOOK.md`)
| Bước | Việc | Tiêu chí dừng |
|---|---|---|
| 1 | Preflight (chỉ đọc). Deploy **bản mới** với `--var MAINTENANCE_MODE:1`; xác nhận 100% lưu lượng (không gradual); `/api/documents` → 503, `/api/health` → 200 | Còn trả khác 503 → còn bản cũ phục vụ; preflight có `CHẶN:` |
| 2 | Chờ ≥ 2 phút; `meta.data_version` không đổi qua 60 giây | Giá trị đổi → còn ghi, quay lại bước 1 |
| 3 | Export D1, ghi bookmark Time Travel, sao chép R2; **diễn tập phục hồi**: nạp `.sql` vào SQLite cục bộ + `preflight --file` → số bản ghi khớp | Bản phục hồi lỗi hoặc lệch số |
| 4 | Từ đúng SHA (`git status` sạch): `npm run db:migrate:remote` (0004 → 0010 theo thứ tự) rồi preflight | Lỗi migrate, còn "Chờ áp dụng", có `CHẶN:` |
| 5 | Kiểm tra toàn vẹn (vẫn bảo trì): preflight, `PRAGMA integrity_check`, đếm bản ghi | Không phải `ok` hoặc lệch số |
| 6 | Deploy cùng SHA với `--var MAINTENANCE_MODE:0` → ghi Version ID làm **mốc an toàn**; smoke chỉ đọc; kiểm tra tay | 5xx lặp, không đăng nhập được → bật lại bảo trì |
| 7 | Sự cố bất kỳ bước nào: **giữ bảo trì hoặc sửa tiến**; chỉ rollback tới bản ≥ mốc an toàn | — |

Vì middleware bảo trì của bản mới không chạm D1/R2, bản mới chạy an toàn trên schema cũ (0001–0003) trong lúc chờ
migrate; Worker cũ bị thay **trước** khi schema đổi. Bật/tắt biến không đổi route, binding D1/R2, secret
(`AUTH_SECRET` không nằm trong `vars`) hay static assets. Không đặt biến qua Dashboard.

## 4. Migration mới
```sql
-- Migration 0010 (additive): an active partner code is unique at the database level.
--
-- Two partners that are not in the trash may not share a code (compared trimmed, case-insensitive
-- for ASCII; the application additionally normalises with full Unicode upper-casing). Partners in the
-- trash are excluded, so restoring one whose code was reused meanwhile fails instead of creating a
-- duplicate — also when two workers create/restore concurrently.
--
-- scripts/preflight.mjs blocks this migration while active partners share a code; the duplicates
-- must be resolved by hand (rename or move one to the trash). No row is modified here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_code_active
  ON partners (upper(trim(code)))
  WHERE deleted_at IS NULL;
```
Chỉ thêm chỉ mục, không sửa 0001–0009, tương thích Production 0001–0003. Diễn tập trên DB giả lập Production
(`tests/migrations.test.ts`): có mã trùng → preflight chặn, chạy migration lỗi `UNIQUE`, không có dòng nào bị đổi,
ledger không ghi 0010; sau khi đổi mã thủ công → áp được, preflight sạch.

## 5. Đoạn mã chính để đối chiếu
**D2 — `src/server/routes/auth.ts` (vòng đăng nhập)**
```ts
  const stillTheVerifiedAccount = (verified: { id: string; password?: string | null; revision?: number | null }) => {
    const now = store.getUser(verified.id);
    return Boolean(now && now.status !== 'locked' && now.password === verified.password && (now.revision ?? 0) === (verified.revision ?? 0));
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const account = store.getUserByUsername(trimmedUser);
    // Unknown usernames still pay for a PBKDF2 run so response time does not reveal which exist
    const { ok, needsRehash } = await verifyPassword(password, account?.password ?? (await dummyPasswordHash()));
    if (!account || !ok) {
      await recordLoginFailure(db, throttleKey);
      return c.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.', code: 'INVALID_CREDENTIALS' }, 401);
    }
    if (account.status === 'locked') {
      return c.json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên.', code: 'ACCOUNT_LOCKED' }, 403);
    }
    const usesDefaultPassword = KNOWN_DEFAULT_PASSWORDS.has(password);
    if (!needsRehash && !(usesDefaultPassword && !account.must_change_password)) {
      // verifyPassword awaited: another request in this isolate may have reset the password or locked
      // the account meanwhile. Only the row as it is now may produce a token.
      if (!stillTheVerifiedAccount(account)) continue;
      accountId = account.id;
      break;
    }
    const newHash = needsRehash ? await hashPassword(password) : null;
    // The cache may have moved during the awaits above: re-check, then update without awaiting
    const current = store.getUser(account.id);
    if (!stillTheVerifiedAccount(account)) continue;
    try {
      store.updateUser(account.id, {
        ...(newHash ? { password: newHash } : {}),
        ...(usesDefaultPassword ? { must_change_password: true } : {}),
      });
      await store.persistAsync();
      const written = store.getUser(account.id);
      if (!written || written.status === 'locked' || written.password !== (newHash ?? account.password)) continue;
      accountId = account.id;
      break;
    } catch (err) {
      if (!(err instanceof RevisionConflictError)) throw err;
      await store.sync(db, (c.env as any)?.DB ? 'd1' : 'json');
    }
  }
  if (!accountId) {
    // The account kept changing under this login: refuse safely, the user can simply retry
    return c.json({ error: 'Tài khoản vừa được cập nhật. Vui lòng đăng nhập lại.', code: 'LOGIN_RETRY' }, 409);
  }
  await clearLoginFailures(db, throttleKey);
```
**D3 — `src/server/routes/attachments.ts` (kiểm tra lại sau upload)**
```ts
  const stored = await storeAttachment(c, file as File, user.id);
  const sha256 = stored.sha256;
  // The upload awaited: another request may have changed the record or this attachment meanwhile.
  // Check again against the live cache and change it without awaiting in between; otherwise the
  // fresh (never attached, unique) object is removed again.
  const latest = getRecord(type, record.id);
  const recheck = latest ? revisionConflict(c, latest, form.get('expected_revision')) : notFound(c);
  const latestReplaced = replaced ? store.getAttachment(replaced.id) : null;
  if (recheck || (replaced && (!latestReplaced || latestReplaced.deleted_at || !latestReplaced.is_current))) {
    await stored.rollback();
    return recheck ?? c.json({ error: 'Hồ sơ đã được người khác cập nhật trong lúc bạn chỉnh sửa.', code: 'REVISION_CONFLICT' }, 409);
  }
```
**D3 — `src/server/db/store.ts`**
```ts
  public async persistAsync() {
    await this.flush();
    // Another request's failed commit discards the cache (stale): this request's changes were not
    // written either, so it must not report success
    if (this.stale) throw new RevisionConflictError();
  }
```
**D4 — `src/server/utils/importer.ts`**
```ts
function matchRow(kind: ImportKind, raw: any, existing: any[]): { match: any | null; error?: string } {
  const field = numberField(kind);
  if (raw?.id) {
    const byId = existing.find((r) => r.id === raw.id);
    if (byId) {
      if (kind === 'document' && raw.doc_type && raw.doc_type !== byId.doc_type) {
        return { match: null, error: 'id: thuộc sổ khác với loại văn bản trong dòng (doc_type)' };
      }
      return { match: byId };
    }
  }
  const n = normalizeNumber(raw?.[field]);
  if (!n) return { match: null };
  const sameNumber = existing.filter((r) => normalizeNumber(r[field]) === n);
  if (kind === 'contract') return { match: sameNumber[0] ?? null };
  if (raw?.doc_type) return { match: sameNumber.find((r) => r.doc_type === raw.doc_type) ?? null };
  if (sameNumber.length > 1) {
    return { match: null, error: `doc_type: số "${raw[field]}" có ở nhiều sổ (${[...new Set(sameNumber.map((r) => r.doc_type))].join(', ')}), cần ghi rõ loại văn bản` };
  }
  return { match: sameNumber[0] ?? null };
}
```
**D5 — `src/server/index.ts` (middleware bảo trì, đăng ký trước mọi route)**
```ts
app.use('/api/*', async (c, next) => {
  const flag = (c.env as any)?.MAINTENANCE_MODE ?? (typeof process !== 'undefined' ? process.env?.MAINTENANCE_MODE : undefined);
  if (String(flag ?? '') === '1' && c.req.path !== '/api/health') {
    return c.json({ error: 'Hệ thống đang bảo trì. Vui lòng thử lại sau.', code: 'MAINTENANCE' }, 503);
  }
  await next();
});
```

## 6. Lỗi mới phát hiện trong PR #8 (đã sửa)
| Lỗi | Xử lý | Test |
|---|---|---|
| D2 còn kẽ hở **trong cùng isolate**: ở nhánh không cần ghi, sau `await verifyPassword` không kiểm tra lại mật khẩu/trạng thái | `stillTheVerifiedAccount()` kiểm tra lại mật khẩu, trạng thái, revision trên bản hiện tại trước khi cấp token; nhánh có ghi kiểm tra lại sau `persistAsync` | "same isolate…" — **thất bại trên mã trước khi sửa**, đạt sau khi sửa |
| `flush` ghi upsert trước delete → chỉ mục UNIQUE báo lỗi giả khi một hàng bị xoá và hàng khác lấy lại mã trong cùng batch | Lệnh xoá trước upsert | Toàn bộ test |
| `persistAsync` có thể báo thành công khi bộ đệm đã bị huỷ | Ném `RevisionConflictError` khi `stale` | D3 |
| Id đối tác suy ra từ mã → tạo lại mã đã xoá vĩnh viễn trùng id cũ | Id ngẫu nhiên | C2/D1 |
| Một số thao tác chỉ dựa vào tự tăng revision lúc `flush` | Mỗi mutator tăng revision rõ ràng | C2/C4 |
| Smoke/test cũ kỳ vọng 400 khi trùng mã đối tác | Đổi sang 409 theo đặc tả mới, không nới kiểm tra | `partners.test.ts`, smoke |

## 7. Kết quả lệnh (commit `2a0e908`, chạy thực tế)
| Lệnh | Kết quả |
|---|---|
| `npm ci` | ✔ |
| `npm run typecheck` | ✔ |
| `npm test` | ✔ **359 test / 31 file** |
| `npm run build` | ✔ |
| `npx wrangler deploy --dry-run --outdir dist/worker` | ✔ (`MAINTENANCE_MODE: "0"`) |
| `npm run audit:prod` | ✔ 0 lỗ hổng |
| `npm run check` | ✔ |
| Smoke E2E `--write` trên server **local**, dữ liệu giả lập | ✔ 72/72 |
| Playwright: sửa hồ sơ, chuyển bước, quyền người dùng, khoá đối tác | ✔ không lỗi API |

## 8. Rủi ro còn lại (bên thực hiện tự nêu)
1. Mã đối tác trùng đang có trong Production (nếu có) sẽ chặn 0010 — chủ dự án phải quyết định đổi mã hay đưa vào thùng rác.
2. `upper()` của SQLite chỉ in hoa ký tự ASCII. Mã mới luôn được ứng dụng chuẩn hoá (in hoa Unicode) trước khi ghi nên chỉ mục bắt được;
   mã cũ chưa chuẩn hoá có ký tự tiếng Việt thường (vd. `đt` vs `ĐT`) chỉ được chặn ở tầng ứng dụng, không ở D1.
3. Bảo trì ~30 phút, không ghi được trong suốt bước 1–5.
4. Request rất dài trên Worker cũ có thể vượt 2 phút chờ — runbook yêu cầu xác nhận `data_version` đứng yên.
5. Worker chưa đồng bộ có thể cấp token cho tài khoản vừa bị khoá ở worker khác; mọi request sau đó kiểm tra lại tài khoản/`token_version` nên phiên bị cắt ngay (đã có test từ PR #7).
6. Số trùng lịch sử không tự sửa (hồ sơ cũ nhất giữ số); thông báo cũ chưa gán người nhận chỉ admin thấy tới khi chạy `assign-legacy`.
7. Bộ đệm toàn bộ bảng mỗi isolate; danh sách API chưa phân trang (phù hợp quy mô hiện tại).
8. Lịch sử git còn dữ liệu thật ở commit đầu — xử lý sau merge (quyết định 1A).

## 9. Câu hỏi cho reviewer
1. D1–D5 đã đủ điều kiện đóng chưa? Nếu chưa, nêu kịch bản tái hiện cụ thể.
2. Rủi ro 2 (in hoa Unicode ở D1) có cần chặn trước khi merge không?
3. Runbook 7 bước đã đủ để chủ dự án thực hiện migration Production chưa?
4. Kết luận: **GO / NO-GO** cho việc merge PR #1 → #8 theo thứ tự.
