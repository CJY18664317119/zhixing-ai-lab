# 开发环境初始化: 装依赖 + 把版本化迁移应用到平台托管的开发库。
# 平台铺完脚手架、开好开发库后自动跑一次; 之后 db/schema.ts 改了表、
# 生成新迁移后, 也用它把迁移落到开发库。
.PHONY: setup
setup:
	pnpm install --prefer-offline --no-frozen-lockfile
	pnpm run db:migrate
