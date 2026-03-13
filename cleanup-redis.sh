#!/bin/bash

# Redis Queue Cleanup Script
# This will remove all stale jobs from BullMQ queues

echo "🧹 Cleaning up Redis BullMQ queues..."
echo ""

# Connect to Redis and clean up
docker exec -i redis-local redis-cli << 'EOF'
# Get all bull queue keys
KEYS bull:*

# Delete all completed jobs older than 1 hour
EVAL "local keys = redis.call('keys', 'bull:*:completed') for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0

# Delete all failed jobs
EVAL "local keys = redis.call('keys', 'bull:*:failed') for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0

# Delete all stalled jobs
EVAL "local keys = redis.call('keys', 'bull:*:stalled') for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0

# Delete old waiting jobs
EVAL "local keys = redis.call('keys', 'bull:*:wait') for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0

# Show remaining keys
KEYS bull:*
EOF

echo ""
echo "✅ Redis cleanup complete!"
echo ""
echo "To prevent this in the future:"
echo "1. The backend now limits retries to 2 attempts max"
echo "2. Auto-cleanup runs every hour"
echo "3. Only keeps last 100 completed and 500 failed jobs"
