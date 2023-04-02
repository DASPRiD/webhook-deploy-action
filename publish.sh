VERSION=$(grep '"version": ' package.json | cut -d\" -f4)

git tag -d v1
git push origin :v1
git tag v1
git tag "v$VERSION"
git push origin --tags
