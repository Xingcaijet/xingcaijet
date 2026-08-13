#!/bin/bash
# XINCAIJET Railway Deploy Script
set -e

cd "$(dirname "$0")"

echo "==> Linking Railway project to site/ directory..."
railway init --name xincaijet-site

echo ""
echo "==> Deploying to Railway..."
railway up

echo ""
echo "==> Done! Check your Railway dashboard for the URL:"
echo "    https://railway.app/dashboard"
