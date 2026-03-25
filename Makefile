# Thumbnail generator — local tasks (macOS / Linux).
# Requires Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/install-and-update/

.PHONY: help dev deploy check

WORKER_DIR := worker

help:
	@echo "Targets:"
	@echo "  make check   — verify wrangler is available"
	@echo "  make dev     — run Worker + widget locally (wrangler dev)"
	@echo "  make deploy  — deploy Worker to Cloudflare"
	@echo ""
	@echo "First-time: copy worker/.dev.vars.example to worker/.dev.vars and set FAL_KEY."

check:
	@command -v wrangler >/dev/null 2>&1 || { echo "Install Wrangler: npm install -g wrangler"; exit 1; }
	@wrangler --version

dev: check
	cd $(WORKER_DIR) && wrangler dev

deploy: check
	cd $(WORKER_DIR) && wrangler deploy
