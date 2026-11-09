#!/bin/bash
 set -e

 DOCKERHUB_USERNAME="bhaskaruday"
 TAG="v1"

 services=(
    auth-service
    organization-service
    project-service
    task-service
    notification-service
    frontend
 )

 for service in "${services[@]}"; do
    SOURCE_IMAGE="teamflow-${service}:latest"
    TARGET_IMAGE="${DOCKERHUB_USERNAME}/teamflow-${service}:${TAG}"

    echo "Tagging: ${SOURCE_IMAGE}"
    docker tag "$SOURCE_IMAGE" "$TARGET_IMAGE"

    echo "Pushing: ${TARGET_IMAGE}"
    docker push "$TARGET_IMAGE"

    echo "Successfully pushed: ${TARGET_IMAGE}"
done

