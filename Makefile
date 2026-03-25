.PHONY: help install setup check dev deploy

WORKER_DIR := worker

help:
	@echo "make install   install wrangler globally"
	@echo "make setup     copy .dev.vars and login to cloudflare"
	@echo "make check     verify wrangler is on PATH"
	@echo "make dev       run worker locally"
	@echo "make deploy    deploy worker to cloudflare"

install:
	npm install -g wrangler

setup:
	@[ -f $(WORKER_DIR)/.dev.vars ] || cp $(WORKER_DIR)/.dev.vars.example $(WORKER_DIR)/.dev.vars
	wrangler login

check:
	@command -v wrangler >/dev/null 2>&1 || { echo "wrangler not found, run: make install"; exit 1; }

dev: check
	cd $(WORKER_DIR) && wrangler dev

deploy: check
	cd $(WORKER_DIR) && wrangler deploy
