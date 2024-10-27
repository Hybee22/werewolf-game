function assignRoles(playerCount, roleCount) {
  const roles = [];
  
  // Add roles based on roleCount
  Object.entries(roleCount).forEach(([role, count]) => {
    for (let i = 0; i < count; i++) {
      roles.push(role);
    }
  });

  // If we don't have enough roles, fill the rest with villagers
  while (roles.length < playerCount) {
    roles.push('villager');
  }

  // If we have too many roles, remove excess roles
  while (roles.length > playerCount) {
    const indexToRemove = Math.floor(Math.random() * roles.length);
    roles.splice(indexToRemove, 1);
  }

  // Shuffle the roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return roles;
}

module.exports = { assignRoles };
