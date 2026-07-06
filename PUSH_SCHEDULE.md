# Git Push Schedule (Jun 23 – Jul 26)

Each day, run the command for that day. GitHub will show the correct date.

---

## Day 1 — Jun 23 (DONE ✅)
- feat: add Product mongoose model
- feat: add Session mongoose model
- feat: add Image mongoose model

---

## Day 2 — Jun 24 (DONE ✅)
```
git push origin 9beb5caa7d20a109d91bfd1a87cdd4d4dd40b832:refs/heads/main
```
- feat: add product controller and routes
- feat: add image controller and routes

---

## Day 3 — Jun 25 (DONE ✅)
```
git push origin 3eba1470fce49746d534ad4db7cfbdcfdc00609e:refs/heads/main
```
- feat: add AI chat service with OpenAI structured output and streaming
- feat: add image matching service with style fallback

---

## Day 4 — Jun 26 (DONE ✅)
```
git push origin 8fc3011cc1ab8375cc00824e449b211faed962f2:refs/heads/main
```
- feat: add chat controller with session management and SSE streaming
- feat: add chat routes with layered rate limiting

---

## Day 5 — Jun 27 (DONE ✅)
```
git push origin 49a5048dcbc8364c44a7519141dcdfdeb19df7b2:refs/heads/main
```
- feat: add Express app with middleware, routes, cron job, and server entry point

---

## Day 6 — Jun 28 (DONE ✅)
```
git push origin fbf8b1d0a2d48acaa8c7917c6cad6a0707561d5d:refs/heads/main
```
- feat: add WooCommerce product scraper service via curl
- feat: add product sync service with upsert logic

---

## Day 7 — Jun 29 (DONE ✅)
```
git push origin f68ba7899c21a40d5da721da91ee438f135963d2:refs/heads/main
```
- feat: add seed script for initial data and sync runner script
- chore: remove static seed data, use sync script for live WooCommerce data

---

## Day 8 — Jun 30 (DONE ✅)
```
git push origin 8009b68edba74a2fa146b123bcd9f2abbe7266d1:refs/heads/main
```
- improve: refine AI system prompt for professional consultant tone and structured communication

---

## Day 9 — Jul 6, 9:14 AM
```
git push origin f105addc2995ac56e51f58ea9e13b9aef2954497:refs/heads/main
```
- fix: WooCommerce API blocked Node.js TLS fingerprint — switched to curl as HTTP transport

---

## Day 10 — Jul 7, 8:47 PM
```
git push origin cf97116c4c1c403725d508567016b632bc9c47cd:refs/heads/main
```
- fix: single rate limit bypassable via multiple sessions — added 6-layer abuse prevention stack

---

## Day 11 — Jul 8, 1:23 PM
```
git push origin 8270f3e66ba07b2f58c98013d74589f039a12539:refs/heads/main
```
- fix: concurrent requests on same session caused race condition — added processingLock to prevent double AI calls

---

## Day 12 — Jul 9, 11:02 AM
```
git push origin d16b9affa9b3f44e0d5b22dcb18d39e731a9976c:refs/heads/main
```
- fix: structured JSON unparseable mid-stream — stream raw tokens live, parse complete buffer on done

---

## Day 13 — Jul 10, 6:38 PM
```
git push origin b981807969d9ba5cfa4011f8d6303e573977fb73:refs/heads/main
```
- fix: full message history exceeded OpenAI context window
- fix: missing OPENAI_API_KEY crashed app on startup
- fix: AI was asking all discovery questions at once — enforced strict one-question-per-response guided flow

---

## Day 14 — Jul 11, 2:57 PM
```
git push origin 6b021de2c543a37fff72e92a9b0aaf0b9e6a9f48:refs/heads/main
```
- fix: AI was proactively asking price and quantity — removed from discovery flow, escalate to human on enquiry

---

## Day 15 — Jul 12, 9:41 PM
```
git push origin 325b6e5130fefdf8a7721bc2dd667db3923b3e74:refs/heads/main
```
- improve: rewrite AI tone to sound human and collect contact info on price/quantity enquiries

---

## Day 16 — Jul 13, 10:15 AM
```
git push origin b60aa847496f5fc61c5228c30cb6fef43cce6844:refs/heads/main
```
- fix: remove timeline from discovery, collect full contact info and prompt human handoff on escalation

---

## Day 17 — Jul 14, 4:29 PM
```
git push origin 2f191bf9c88e350849f4ab219840516e6b08da92:refs/heads/main
```
- improve: make greeting warm and human — natural intro as Alex on first message

---

## Day 18 — Jul 15, 7:52 PM
```
git push origin 769e64ef71128fcab2d2926c436955e3fb23b348:refs/heads/main
```
- fix: enforce full contact collection — name, email, phone all required before human handoff

---

## Day 19 — Jul 16, 12:38 PM
```
git push origin 7302362:refs/heads/main
```
- feat: add User model with bcrypt hashing and JWT auth middleware

---

## Day 20 — Jul 17, 3:04 PM
```
git push origin 64373ca:refs/heads/main
```
- feat: add admin auth controller and user management controller with full CRUD

---

## Day 21 — Jul 18, 8:19 PM
```
git push origin 6712ad7:refs/heads/main
```
- feat: add user auth controller, role-based menu controller, and dashboard controller

---

## Day 22 — Jul 19, 11:47 AM
```
git push origin 9f1b234:refs/heads/main
```
- feat: add admin and user auth routes, user management routes, menu and dashboard routes

---

## Day 23 — Jul 20, 5:33 PM
```
git push origin eef28c9:refs/heads/main
```
- feat: add HandoffToken and CustomerToken models for email-based staff handoff

---

## Day 24 — Jul 21, 9:58 AM
```
git push origin 724c16c:refs/heads/main
```
- fix: move hardcoded admin credentials and JWT secret to environment variables

---

## Day 25 — Jul 22, 2:11 PM
```
git push origin 3ffd1a7:refs/heads/main
```
- feat: add email service with five Nodemailer templates for staff and customer handoff loop

---

## Day 26 — Jul 23, 6:44 PM
```
git push origin c17c0ee:refs/heads/main
```
- feat: add notifyHandoff service — creates tokens and dispatches all emails on human escalation

---

## Day 27 — Jul 24, 10:27 AM
```
git push origin b718cd2:refs/heads/main
```
- feat: add handoff controller and routes — view, accept, assign, unassign, reply, close, customer endpoints

---

## Day 28 — Jul 25, 4:56 PM
```
git push origin b467f03:refs/heads/main
```
- feat: wire notifyHandoff into chatController and add nightly token purge cron

---

## Day 29 — Jul 26, 7:38 PM
```
git push origin 0cdc637:refs/heads/main
```
- docs: add API integration guide PDF for frontend team

---

## Day 30 — Jul 27, 11:15 AM
```
git push origin ec0a540:refs/heads/main
```
- refactor: simplify role system to user/admin — drop staff/manager/viewer tiers
