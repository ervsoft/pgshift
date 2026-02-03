#!/bin/bash

# PGShift Version Bump Script
# Usage: ./version.sh [major|minor|patch] "Commit message"
# Example: ./version.sh minor "Add new feature X"

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PGSHIFT_DIR="$SCRIPT_DIR/pgshift"
CARGO_TOML="$PGSHIFT_DIR/src-tauri/Cargo.toml"
TAURI_CONF="$PGSHIFT_DIR/src-tauri/tauri.conf.json"
PACKAGE_JSON="$PGSHIFT_DIR/package.json"
CHANGELOG="$SCRIPT_DIR/CHANGELOG.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_usage() {
    echo -e "${BLUE}PGShift Version Bump Script${NC}"
    echo ""
    echo "Usage: $0 [major|minor|patch] \"Commit message\""
    echo ""
    echo "Options:"
    echo "  major   - Breaking changes (1.0.0 -> 2.0.0)"
    echo "  minor   - New features (1.0.0 -> 1.1.0)"
    echo "  patch   - Bug fixes (1.0.0 -> 1.0.1)"
    echo ""
    echo "Example:"
    echo "  $0 minor \"Add multi-connection support\""
    echo "  $0 patch \"Fix ENUM quoting issue\""
    echo "  $0 major \"Complete rewrite with new architecture\""
}

if [ $# -lt 1 ]; then
    print_usage
    exit 1
fi

BUMP_TYPE=$1
COMMIT_MSG=${2:-"Version bump"}

# Get current version from Cargo.toml
CURRENT_VERSION=$(grep '^version = ' "$CARGO_TOML" | head -1 | sed 's/version = "\(.*\)"/\1/')

if [ -z "$CURRENT_VERSION" ]; then
    echo -e "${RED}Error: Could not read current version from Cargo.toml${NC}"
    exit 1
fi

echo -e "${BLUE}Current version: ${YELLOW}$CURRENT_VERSION${NC}"

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate new version
case $BUMP_TYPE in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
    *)
        echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'. Use major, minor, or patch.${NC}"
        print_usage
        exit 1
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo -e "${GREEN}New version: ${YELLOW}$NEW_VERSION${NC}"

# Update Cargo.toml
echo -e "${BLUE}Updating Cargo.toml...${NC}"
sed -i '' "s/^version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" "$CARGO_TOML"

# Update tauri.conf.json
echo -e "${BLUE}Updating tauri.conf.json...${NC}"
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$TAURI_CONF"

# Update package.json
echo -e "${BLUE}Updating package.json...${NC}"
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"

# Update CHANGELOG.md - add new version section
echo -e "${BLUE}Updating CHANGELOG.md...${NC}"
DATE=$(date +%Y-%m-%d)

# Create new changelog entry
NEW_ENTRY="## [$NEW_VERSION] - $DATE

### Changed
- $COMMIT_MSG

"

# Insert after the header (after first ## line pattern)
sed -i '' "/^## \[/i\\
$NEW_ENTRY
" "$CHANGELOG" 2>/dev/null || {
    # If sed fails, use awk
    awk -v entry="$NEW_ENTRY" '
        /^## \[/ && !inserted {
            print entry
            inserted=1
        }
        {print}
    ' "$CHANGELOG" > "$CHANGELOG.tmp" && mv "$CHANGELOG.tmp" "$CHANGELOG"
}

echo -e "${GREEN}✓ Version bumped from $CURRENT_VERSION to $NEW_VERSION${NC}"

# Ask to build and commit
echo ""
read -p "Build release bundles? (y/n) " -n 1 -r BUILD_CHOICE
echo ""

if [[ $BUILD_CHOICE =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Building release bundles...${NC}"
    cd "$PGSHIFT_DIR"
    
    # Build DMG
    echo -e "${YELLOW}Building macOS DMG...${NC}"
    npm run tauri build -- --bundles dmg
    
    # Copy DMG to root
    DMG_FILE="$PGSHIFT_DIR/src-tauri/target/release/bundle/dmg/PGShift_${NEW_VERSION}_x64.dmg"
    if [ -f "$DMG_FILE" ]; then
        cp "$DMG_FILE" "$SCRIPT_DIR/"
        echo -e "${GREEN}✓ DMG copied to $SCRIPT_DIR/PGShift_${NEW_VERSION}_x64.dmg${NC}"
    fi
    
    cd "$SCRIPT_DIR"
fi

echo ""
read -p "Commit and tag this version? (y/n) " -n 1 -r COMMIT_CHOICE
echo ""

if [[ $COMMIT_CHOICE =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Committing changes...${NC}"
    git add -A
    git commit -m "v$NEW_VERSION: $COMMIT_MSG"
    git tag -a "v$NEW_VERSION" -m "Version $NEW_VERSION: $COMMIT_MSG"
    
    echo -e "${GREEN}✓ Changes committed and tagged as v$NEW_VERSION${NC}"
    
    read -p "Push to remote? (y/n) " -n 1 -r PUSH_CHOICE
    echo ""
    
    if [[ $PUSH_CHOICE =~ ^[Yy]$ ]]; then
        git push origin main --tags
        echo -e "${GREEN}✓ Pushed to remote with tags${NC}"
        echo -e "${YELLOW}🚀 GitHub Actions will now build Windows EXE and macOS DMG automatically!${NC}"
        echo -e "${BLUE}   Check: https://github.com/ervsoft/pgshift/actions${NC}"
    fi
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Version $NEW_VERSION release complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. GitHub Actions will build macOS DMG and Windows EXE"
echo "  2. Go to GitHub Releases to download the builds"
echo "  3. Update download links in README.md if needed"
echo ""
echo "  Release URL: https://github.com/ervsoft/pgshift/releases/tag/v$NEW_VERSION"
