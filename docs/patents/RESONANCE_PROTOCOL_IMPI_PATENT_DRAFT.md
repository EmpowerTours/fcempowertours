# SOLICITUD DE PATENTE DE INVENCIÓN
## INSTITUTO MEXICANO DE LA PROPIEDAD INDUSTRIAL (IMPI)

---

# PROTOCOLO RESONANCE: Sistema Descentralizado de Verificación de Consumo de Medios Digitales Mediante Atestación de Identidad Social

## RESONANCE PROTOCOL: Decentralized Digital Media Consumption Verification System Using Social Identity Attestation

---

## INFORMACIÓN DEL SOLICITANTE / APPLICANT INFORMATION

**Nombre del Solicitante / Applicant Name:** [NOMBRE COMPLETO]

**Nacionalidad / Nationality:** Mexicana

**Domicilio / Address:** Villa Guerrero, Estado de México, México

**Nombre del Inventor / Inventor Name:** [NOMBRE COMPLETO]

**Fecha de Presentación / Filing Date:** [FECHA]

**Número de Expediente / File Number:** [A ser asignado por IMPI]

---

## I. TÍTULO DE LA INVENCIÓN / TITLE OF THE INVENTION

**Español:**
"MÉTODO Y SISTEMA PARA LA VERIFICACIÓN DESCENTRALIZADA DEL CONSUMO DE MEDIOS DIGITALES UTILIZANDO ATESTACIÓN DE IDENTIDAD SOCIAL Y ESQUEMAS DE COMPROMISO TEMPORAL"

**English:**
"METHOD AND SYSTEM FOR DECENTRALIZED VERIFICATION OF DIGITAL MEDIA CONSUMPTION USING SOCIAL IDENTITY ATTESTATION AND TEMPORAL COMMITMENT SCHEMES"

---

## II. CAMPO TÉCNICO / TECHNICAL FIELD

La presente invención se refiere al campo de los protocolos de blockchain, sistemas de oráculo descentralizados, verificación de identidad digital y distribución de regalías para creadores de contenido. Específicamente, la invención describe un método novedoso para verificar el consumo auténtico de medios digitales (música, video, contenido) utilizando identidad social descentralizada como mecanismo de resistencia a ataques Sybil, combinado con esquemas criptográficos de compromiso-revelación para prevenir manipulación.

The present invention relates to the field of blockchain protocols, decentralized oracle systems, digital identity verification, and royalty distribution for content creators. Specifically, the invention describes a novel method for verifying authentic digital media consumption (music, video, content) using decentralized social identity as a Sybil-resistance mechanism, combined with cryptographic commit-reveal schemes to prevent manipulation.

---

## III. ANTECEDENTES DE LA INVENCIÓN / BACKGROUND OF THE INVENTION

### 3.1 Estado del Arte / Prior Art

Los sistemas actuales de verificación de reproducción de medios digitales presentan las siguientes deficiencias:

**A. Sistemas Centralizados (Spotify, Apple Music, YouTube)**
- Verificación controlada por una entidad central
- Susceptibles a manipulación interna
- Distribución de regalías opaca
- Sin mecanismo de auditoría pública

**B. Oráculos Blockchain Existentes (Chainlink, Pyth Network)**
- Diseñados para datos financieros (precios, tasas)
- No abordan verificación de consumo de medios
- Dependen de operadores de nodos centralizados
- Sin mecanismo de identidad social

**C. Sistemas de Prueba de Asistencia (POAP)**
- Verifican presencia en eventos
- Carecen de resistencia Sybil robusta
- No verifican consumo continuo de medios
- Fácilmente manipulables con múltiples direcciones

**D. Sistemas de Identidad Biométrica (Worldcoin)**
- Requieren hardware especializado
- Preocupaciones de privacidad significativas
- No aplicables a verificación de medios
- Infraestructura costosa

### 3.2 Problema Técnico / Technical Problem

No existe un sistema que combine:
1. Verificación de consumo de medios digitales
2. Resistencia Sybil basada en identidad social
3. Esquemas de compromiso temporal para prevenir manipulación
4. Distribución automática de regalías en blockchain
5. Consenso descentralizado entre múltiples atestadores

---

## IV. RESUMEN DE LA INVENCIÓN / SUMMARY OF THE INVENTION

La presente invención proporciona un método y sistema para verificar el consumo auténtico de medios digitales utilizando cuatro componentes novedosos:

### 4.1 Prueba de Grafo Social (Social Graph Proof)
Utilización de identificadores sociales descentralizados (Farcaster FID) donde la reputación del usuario se deriva de:
- Antigüedad de la cuenta
- Número y calidad de conexiones sociales
- Historial de actividad verificable
- Penalizaciones por comportamiento malicioso

### 4.2 Esquema de Compromiso Temporal (Temporal Commitment Scheme)
Mecanismo criptográfico de dos fases:
- **Fase de Compromiso:** Usuario genera hash de (contenido_id + timestamp_inicio + secreto) al iniciar reproducción
- **Fase de Revelación:** Usuario revela datos originales al finalizar, demostrando duración real de consumo

### 4.3 Consenso Descentralizado de Atestadores
Múltiples participantes atestiguan el mismo evento de consumo:
- Puntaje de confianza basado en número de atestaciones coincidentes
- Umbral configurable para considerar consumo verificado
- Penalizaciones económicas por atestaciones falsas

### 4.4 Distribución Automática de Regalías On-Chain
Contrato inteligente que distribuye pagos automáticamente:
- Porcentaje configurable para artista, plataforma, atestadores
- Ejecutado inmediatamente tras verificación
- Completamente auditable y transparente

---

## V. DESCRIPCIÓN DETALLADA DE LA INVENCIÓN / DETAILED DESCRIPTION

### 5.1 Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ARQUITECTURA PROTOCOLO RESONANCE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CAPA DE IDENTIDAD SOCIAL                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Farcaster FID → Puntaje de Reputación                              │    │
│  │                                                                      │    │
│  │  Factores:                                                          │    │
│  │  • Antigüedad de cuenta (días desde registro)                       │    │
│  │  • Seguidores verificados                                           │    │
│  │  • Conexiones bidireccionales (follows mutuos)                      │    │
│  │  • Historial de atestaciones previas                                │    │
│  │  • Penalizaciones acumuladas                                        │    │
│  │                                                                      │    │
│  │  Fórmula: RS = (A × 0.2) + (S × 0.3) + (C × 0.3) + (H × 0.2) - P   │    │
│  │  Donde: RS=ReputationScore, A=Age, S=Followers, C=Connections,      │    │
│  │         H=History, P=Penalties                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  CAPA DE COMPROMISO-REVELACIÓN                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  FASE 1: COMPROMISO (al iniciar reproducción)                       │    │
│  │  ────────────────────────────────────────────────────────────────   │    │
│  │  commitment = keccak256(                                            │    │
│  │      fid,                    // Identificador social                │    │
│  │      contentId,              // Hash del contenido                  │    │
│  │      startTimestamp,         // Momento de inicio                   │    │
│  │      secret                  // Valor aleatorio del usuario         │    │
│  │  )                                                                  │    │
│  │                                                                      │    │
│  │  → Almacenado en blockchain con timestamp de bloque                 │    │
│  │                                                                      │    │
│  │  FASE 2: REVELACIÓN (al finalizar reproducción)                     │    │
│  │  ────────────────────────────────────────────────────────────────   │    │
│  │  reveal(fid, contentId, startTimestamp, secret, endTimestamp)       │    │
│  │                                                                      │    │
│  │  Validaciones:                                                      │    │
│  │  • Hash coincide con compromiso almacenado                          │    │
│  │  • endTimestamp - startTimestamp >= duración mínima del contenido   │    │
│  │  • endTimestamp <= timestamp actual del bloque                      │    │
│  │  • No existe revelación previa para este compromiso                 │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  CAPA DE CONSENSO DE ATESTADORES                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Múltiples usuarios atestiguan el mismo evento:                     │    │
│  │                                                                      │    │
│  │  Atestador A (RS=85) ──┐                                            │    │
│  │  Atestador B (RS=72) ──┼──→ Puntaje Agregado de Confianza          │    │
│  │  Atestador C (RS=91) ──┘                                            │    │
│  │                                                                      │    │
│  │  Fórmula de Consenso:                                               │    │
│  │  CS = Σ(RSi × Wi) / Σ(Wi)                                          │    │
│  │  Donde Wi = peso basado en stake del atestador                      │    │
│  │                                                                      │    │
│  │  Umbral de Verificación: CS >= 70                                   │    │
│  │                                                                      │    │
│  │  Condiciones de Penalización (Slashing):                            │    │
│  │  • Atestación contradicha por mayoría → -10% stake                  │    │
│  │  • Atestación de contenido inexistente → -50% stake                 │    │
│  │  • Colusión detectada → -100% stake + ban temporal                  │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  CAPA DE DISTRIBUCIÓN DE REGALÍAS                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  Distribución Automática por Reproducción Verificada:               │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────┐        │    │
│  │  │  Pago Total por Reproducción: 0.001 WMON                │        │    │
│  │  │                                                          │        │    │
│  │  │  → 70% Artista/Creador                                  │        │    │
│  │  │  → 15% Atestadores (dividido proporcionalmente)         │        │    │
│  │  │  → 10% Pool de Staking (holders del token)              │        │    │
│  │  │  → 5%  Protocolo (desarrollo y mantenimiento)           │        │    │
│  │  └─────────────────────────────────────────────────────────┘        │    │
│  │                                                                      │    │
│  │  Ejecución: Automática mediante contrato inteligente                │    │
│  │  Frecuencia: Por cada reproducción verificada                       │    │
│  │  Auditoría: Todas las transacciones públicas en blockchain          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Flujo de Operación Detallado

#### 5.2.1 Registro de Contenido

```solidity
struct Content {
    bytes32 contentId;          // Hash único del contenido
    address creator;            // Dirección del creador
    uint256 creatorFid;         // FID de Farcaster del creador
    uint256 duration;           // Duración en segundos
    uint256 minPlayDuration;    // Duración mínima para contar como reproducción
    string metadataIPFS;        // Metadatos en IPFS
    uint256 totalVerifiedPlays; // Contador de reproducciones verificadas
    uint256 totalRoyaltiesPaid; // Total de regalías distribuidas
}

function registerContent(
    bytes32 contentId,
    uint256 duration,
    uint256 minPlayDuration,
    string calldata metadataIPFS
) external;
```

#### 5.2.2 Compromiso de Reproducción

```solidity
struct PlayCommitment {
    bytes32 commitmentHash;
    uint256 listenerFid;
    bytes32 contentId;
    uint256 blockNumber;        // Bloque en que se registró
    uint256 blockTimestamp;     // Timestamp del bloque
    bool revealed;
    bool verified;
}

function commitPlay(
    bytes32 commitmentHash,
    bytes32 contentId
) external {
    // Validar que el FID tiene suficiente reputación
    require(getReputationScore(msg.sender) >= MIN_REPUTATION, "Insufficient reputation");

    // Almacenar compromiso
    commitments[commitmentHash] = PlayCommitment({
        commitmentHash: commitmentHash,
        listenerFid: getFidFromAddress(msg.sender),
        contentId: contentId,
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
        revealed: false,
        verified: false
    });

    emit PlayCommitted(commitmentHash, contentId, block.timestamp);
}
```

#### 5.2.3 Revelación y Verificación

```solidity
function revealPlay(
    uint256 fid,
    bytes32 contentId,
    uint256 startTimestamp,
    bytes32 secret,
    uint256 endTimestamp
) external {
    // Recalcular hash de compromiso
    bytes32 expectedHash = keccak256(abi.encodePacked(
        fid,
        contentId,
        startTimestamp,
        secret
    ));

    PlayCommitment storage commitment = commitments[expectedHash];

    // Validaciones
    require(commitment.commitmentHash == expectedHash, "Invalid commitment");
    require(!commitment.revealed, "Already revealed");
    require(endTimestamp > startTimestamp, "Invalid duration");
    require(endTimestamp <= block.timestamp, "Future end time");

    uint256 playDuration = endTimestamp - startTimestamp;
    Content storage content = contents[contentId];

    require(playDuration >= content.minPlayDuration, "Play too short");

    // Marcar como revelado
    commitment.revealed = true;

    // Crear atestación pendiente de consenso
    createAttestation(fid, contentId, playDuration, startTimestamp, endTimestamp);

    emit PlayRevealed(expectedHash, fid, contentId, playDuration);
}
```

#### 5.2.4 Consenso de Atestadores

```solidity
struct Attestation {
    bytes32 attestationId;
    uint256 listenerFid;
    bytes32 contentId;
    uint256 playDuration;
    uint256 startTime;
    uint256 endTime;
    uint256 confidenceScore;
    AttestationStatus status;
    mapping(uint256 => bool) attesters;     // FIDs que atestiguaron
    mapping(uint256 => uint256) attesterScores; // Puntaje de cada atestador
    uint256 totalAttesters;
}

function attestPlay(
    bytes32 attestationId,
    bool isValid
) external {
    uint256 attesterFid = getFidFromAddress(msg.sender);
    Attestation storage attestation = attestations[attestationId];

    require(!attestation.attesters[attesterFid], "Already attested");
    require(attestation.status == AttestationStatus.PENDING, "Not pending");

    uint256 attesterReputation = getReputationScore(attesterFid);
    uint256 attesterStake = stakes[attesterFid];

    // Peso del atestador basado en reputación y stake
    uint256 weight = (attesterReputation * attesterStake) / 1e18;

    attestation.attesters[attesterFid] = true;
    attestation.attesterScores[attesterFid] = weight;
    attestation.totalAttesters++;

    if (isValid) {
        attestation.confidenceScore += weight;
    }

    // Verificar si se alcanzó consenso
    if (attestation.totalAttesters >= MIN_ATTESTERS) {
        finalizeAttestation(attestationId);
    }

    emit AttestationReceived(attestationId, attesterFid, isValid, weight);
}

function finalizeAttestation(bytes32 attestationId) internal {
    Attestation storage attestation = attestations[attestationId];

    uint256 totalWeight = calculateTotalWeight(attestationId);
    uint256 confidencePercentage = (attestation.confidenceScore * 100) / totalWeight;

    if (confidencePercentage >= VERIFICATION_THRESHOLD) {
        attestation.status = AttestationStatus.VERIFIED;
        distributeRoyalties(attestation.contentId, attestation.listenerFid);
        updateContentStats(attestation.contentId);
        rewardAttesters(attestationId, true);
    } else {
        attestation.status = AttestationStatus.REJECTED;
        penalizeDissenters(attestationId);
    }

    emit AttestationFinalized(attestationId, attestation.status, confidencePercentage);
}
```

#### 5.2.5 Distribución de Regalías

```solidity
function distributeRoyalties(
    bytes32 contentId,
    uint256 listenerFid
) internal {
    Content storage content = contents[contentId];
    uint256 totalPayment = ROYALTY_PER_PLAY;

    // 70% al creador
    uint256 creatorShare = (totalPayment * 70) / 100;
    paymentToken.transfer(content.creator, creatorShare);

    // 15% a atestadores (distribuido en rewardAttesters)
    uint256 attesterShare = (totalPayment * 15) / 100;
    attesterPool += attesterShare;

    // 10% al pool de staking
    uint256 stakingShare = (totalPayment * 10) / 100;
    stakingPool += stakingShare;

    // 5% al protocolo
    uint256 protocolShare = (totalPayment * 5) / 100;
    paymentToken.transfer(protocolTreasury, protocolShare);

    content.totalVerifiedPlays++;
    content.totalRoyaltiesPaid += totalPayment;

    emit RoyaltiesDistributed(contentId, creatorShare, attesterShare, stakingShare);
}
```

### 5.3 Cálculo de Puntaje de Reputación Social

```solidity
struct SocialIdentity {
    uint256 fid;                    // Farcaster ID
    uint256 registrationTimestamp;  // Cuándo se registró
    uint256 followerCount;          // Seguidores
    uint256 followingCount;         // Siguiendo
    uint256 mutualConnections;      // Conexiones bidireccionales
    uint256 totalAttestations;      // Atestaciones realizadas
    uint256 accurateAttestations;   // Atestaciones correctas
    uint256 penaltyPoints;          // Penalizaciones acumuladas
    uint256 stakedAmount;           // Tokens en stake
}

function calculateReputationScore(uint256 fid) public view returns (uint256) {
    SocialIdentity storage identity = identities[fid];

    // Factor de antigüedad (máx 20 puntos)
    uint256 ageDays = (block.timestamp - identity.registrationTimestamp) / 1 days;
    uint256 ageScore = min(ageDays / 30, 20); // 1 punto por mes, máx 20

    // Factor de seguidores (máx 30 puntos)
    uint256 followerScore = min(identity.followerCount / 10, 30);

    // Factor de conexiones mutuas (máx 30 puntos)
    uint256 connectionScore = min(identity.mutualConnections / 5, 30);

    // Factor de historial (máx 20 puntos)
    uint256 historyScore = 0;
    if (identity.totalAttestations > 0) {
        uint256 accuracy = (identity.accurateAttestations * 100) / identity.totalAttestations;
        historyScore = (accuracy * 20) / 100;
    }

    // Penalizaciones
    uint256 penaltyDeduction = min(identity.penaltyPoints, 50);

    // Puntaje total
    uint256 totalScore = ageScore + followerScore + connectionScore + historyScore;

    if (penaltyDeduction >= totalScore) {
        return 0;
    }

    return totalScore - penaltyDeduction;
}
```

### 5.4 Mecanismo Anti-Sybil

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MECANISMO DE RESISTENCIA SYBIL                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  VECTOR DE ATAQUE             │  MITIGACIÓN                                 │
│  ─────────────────────────────┼────────────────────────────────────────────│
│  Crear múltiples FIDs         │  Cuentas nuevas tienen RS bajo (cerca de 0)│
│                               │  Necesitan meses para acumular reputación  │
│  ─────────────────────────────┼────────────────────────────────────────────│
│  Comprar seguidores falsos    │  Solo conexiones mutuas cuentan alto       │
│                               │  Análisis de grafo detecta clusters        │
│  ─────────────────────────────┼────────────────────────────────────────────│
│  Bots automatizados           │  Requieren comportamiento social genuino   │
│                               │  Historial de actividad verificable        │
│  ─────────────────────────────┼────────────────────────────────────────────│
│  Colusión entre atestadores   │  Stake económico en riesgo                 │
│                               │  Detección estadística de patrones         │
│                               │  Penalización severa si se detecta         │
│  ─────────────────────────────┼────────────────────────────────────────────│
│  Manipulación de timestamps   │  Timestamps de bloque son inmutables       │
│                               │  Ventana de revelación limitada            │
│  ─────────────────────────────┼────────────────────────────────────────────│
│  Atestación sin consumo real  │  Commit-reveal previene pre-computación    │
│                               │  Secreto aleatorio por sesión              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## VI. REIVINDICACIONES / CLAIMS

### Reivindicación 1 (Independiente - Método)
Un método implementado por computadora para verificar el consumo de medios digitales, que comprende:

a) Recibir un identificador social descentralizado (FID) de un usuario que desea consumir contenido;

b) Calcular un puntaje de reputación social basado en:
   - Antigüedad de la cuenta del usuario
   - Número de conexiones sociales verificadas
   - Historial de atestaciones previas
   - Penalizaciones acumuladas;

c) Al inicio del consumo, recibir y almacenar un compromiso criptográfico que comprende un hash de:
   - El identificador social del usuario
   - Un identificador único del contenido
   - Una marca temporal de inicio
   - Un valor secreto aleatorio generado por el usuario;

d) Al finalizar el consumo, recibir una revelación que incluye:
   - Los valores originales usados para generar el compromiso
   - Una marca temporal de finalización;

e) Verificar que:
   - El hash recalculado coincide con el compromiso almacenado
   - La duración del consumo es consistente con la duración del contenido
   - Las marcas temporales son válidas y no manipuladas;

f) Agregar atestaciones de múltiples usuarios verificados para generar un puntaje de confianza;

g) Distribuir automáticamente regalías mediante contrato inteligente cuando el puntaje de confianza supera un umbral predeterminado.

### Reivindicación 2 (Dependiente de 1)
El método de la reivindicación 1, donde el puntaje de reputación social se calcula mediante la fórmula:

RS = (A × 0.2) + (S × 0.3) + (C × 0.3) + (H × 0.2) - P

Donde:
- RS es el puntaje de reputación
- A es un factor de antigüedad normalizado
- S es un factor de seguidores normalizado
- C es un factor de conexiones mutuas normalizado
- H es un factor de historial de atestaciones
- P son las penalizaciones acumuladas

### Reivindicación 3 (Dependiente de 1)
El método de la reivindicación 1, donde el compromiso criptográfico utiliza la función hash Keccak-256 según el estándar Ethereum.

### Reivindicación 4 (Dependiente de 1)
El método de la reivindicación 1, donde la verificación incluye una ventana temporal máxima entre compromiso y revelación para prevenir almacenamiento indefinido de compromisos.

### Reivindicación 5 (Dependiente de 1)
El método de la reivindicación 1, donde la distribución de regalías comprende:
- Un porcentaje predeterminado para el creador del contenido
- Un porcentaje para los atestadores participantes
- Un porcentaje para un pool de staking
- Un porcentaje para mantenimiento del protocolo

### Reivindicación 6 (Dependiente de 1)
El método de la reivindicación 1, que además comprende un mecanismo de penalización donde:
- Atestadores que proporcionan atestaciones contradichas por la mayoría pierden una porción de su stake
- Atestadores que atestiguan contenido inexistente pierden una porción mayor de su stake
- Patrones de colusión detectados resultan en pérdida total del stake y suspensión temporal

### Reivindicación 7 (Independiente - Sistema)
Un sistema para verificar el consumo de medios digitales que comprende:

a) Un módulo de identidad social configurado para:
   - Interfazar con un protocolo de identidad descentralizada
   - Calcular y mantener puntajes de reputación
   - Verificar la autenticidad de identificadores sociales;

b) Un módulo de compromiso-revelación configurado para:
   - Recibir y almacenar compromisos criptográficos
   - Validar revelaciones contra compromisos almacenados
   - Verificar consistencia temporal de las reproducciones;

c) Un módulo de consenso configurado para:
   - Agregar atestaciones de múltiples participantes
   - Calcular puntajes de confianza ponderados
   - Determinar el estado de verificación de reproducciones;

d) Un módulo de distribución configurado para:
   - Ejecutar transferencias automáticas de tokens
   - Distribuir regalías según porcentajes predeterminados
   - Mantener registros auditables de todas las transacciones;

e) Un contrato inteligente desplegado en una red blockchain que integra los módulos anteriores.

### Reivindicación 8 (Dependiente de 7)
El sistema de la reivindicación 7, donde el protocolo de identidad descentralizada es Farcaster y los identificadores sociales son Farcaster IDs (FIDs).

### Reivindicación 9 (Dependiente de 7)
El sistema de la reivindicación 7, donde la red blockchain es compatible con la Máquina Virtual de Ethereum (EVM).

### Reivindicación 10 (Independiente - Uso)
Uso del método de la reivindicación 1 para:
- Verificación de reproducciones musicales
- Verificación de visualizaciones de video
- Verificación de consumo de podcasts
- Verificación de asistencia a eventos virtuales
- Verificación de experiencias turísticas
- Verificación de interacciones con contenido educativo

---

## VII. DIBUJOS / DRAWINGS

### Figura 1: Arquitectura General del Sistema
[Ver diagrama en Sección V.1]

### Figura 2: Flujo de Compromiso-Revelación

```
    USUARIO                    BLOCKCHAIN                   CONTENIDO
       │                           │                            │
       │  1. Inicia reproducción   │                            │
       │──────────────────────────>│                            │
       │                           │                            │
       │  2. Genera secreto        │                            │
       │  aleatorio (s)            │                            │
       │                           │                            │
       │  3. Calcula commitment    │                            │
       │  c = H(fid,cid,ts,s)     │                            │
       │                           │                            │
       │  4. Envía commitment      │                            │
       │──────────────────────────>│                            │
       │                           │  5. Almacena c             │
       │                           │     con timestamp          │
       │                           │                            │
       │  [Consumo del contenido]  │                            │
       │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ >│
       │                           │                            │
       │  6. Finaliza reproducción │                            │
       │                           │                            │
       │  7. Envía reveal          │                            │
       │  (fid,cid,ts,s,te)       │                            │
       │──────────────────────────>│                            │
       │                           │  8. Verifica:              │
       │                           │     H(fid,cid,ts,s) == c  │
       │                           │     te - ts >= min_dur     │
       │                           │     te <= now              │
       │                           │                            │
       │  9. Confirmación          │                            │
       │<──────────────────────────│                            │
       │                           │                            │
```

### Figura 3: Flujo de Consenso y Distribución

```
  ATESTADOR 1    ATESTADOR 2    ATESTADOR 3         CONTRATO
      │              │              │                   │
      │              │              │    Atestación     │
      │──────────────┼──────────────┼──────────────────>│
      │              │              │    creada         │
      │              │              │                   │
      │   Atestigua  │              │                   │
      │─────────────────────────────────────────────────>│
      │              │              │                   │
      │              │   Atestigua  │                   │
      │              │──────────────────────────────────>│
      │              │              │                   │
      │              │              │   Atestigua       │
      │              │              │──────────────────>│
      │              │              │                   │
      │              │              │    ┌─────────────┐│
      │              │              │    │ Calcula     ││
      │              │              │    │ consenso    ││
      │              │              │    │             ││
      │              │              │    │ CS >= 70?   ││
      │              │              │    └──────┬──────┘│
      │              │              │           │       │
      │              │              │    ┌──────▼──────┐│
      │              │              │    │ Distribuye  ││
      │              │              │    │ regalías    ││
      │              │              │    │             ││
      │              │              │    │ 70% Artista ││
      │              │              │    │ 15% Attest. ││
      │              │              │    │ 10% Stake   ││
      │              │              │    │ 5% Protocol ││
      │              │              │    └─────────────┘│
      │              │              │                   │
```

### Figura 4: Cálculo de Puntaje de Reputación

```
┌─────────────────────────────────────────────────────────────────┐
│                    FARCASTER SOCIAL GRAPH                        │
│                                                                  │
│         ┌───┐                                                    │
│     ┌───│ A │───┐      ← Usuario A (objetivo)                   │
│     │   └───┘   │                                                │
│     │     │     │                                                │
│   ┌─▼─┐ ┌─▼─┐ ┌─▼─┐                                             │
│   │ B │ │ C │ │ D │    ← Conexiones directas                    │
│   └─┬─┘ └─┬─┘ └─┬─┘                                             │
│     │     │     │                                                │
│   ┌─▼─┐ ┌─▼─┐ ┌─▼─┐                                             │
│   │ E │ │ F │ │ G │    ← Conexiones de 2do grado                │
│   └───┘ └───┘ └───┘                                             │
│                                                                  │
│  ═══════════════════════════════════════════════════════════    │
│                                                                  │
│  CÁLCULO DE REPUTACIÓN PARA A:                                  │
│                                                                  │
│  Antigüedad:      180 días     → Score: 6/20                    │
│  Seguidores:      250          → Score: 25/30                   │
│  Mutuos (B↔A):    45           → Score: 9/30                    │
│  Historial:       95% accuracy → Score: 19/20                   │
│  Penalizaciones:  0            → Deducción: 0                   │
│                                                                  │
│  TOTAL: 6 + 25 + 9 + 19 - 0 = 59/100                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## VIII. RESUMEN / ABSTRACT

**Español:**

La presente invención describe un método y sistema para la verificación descentralizada del consumo de medios digitales utilizando atestación de identidad social. El sistema emplea identificadores sociales descentralizados (Farcaster FIDs) como mecanismo de resistencia Sybil, donde la reputación del usuario se deriva de la antigüedad de su cuenta, conexiones sociales y historial de comportamiento. Se implementa un esquema criptográfico de compromiso-revelación de dos fases que previene la manipulación de datos de consumo: los usuarios generan un hash criptográfico al iniciar la reproducción y revelan los datos originales al finalizarla, permitiendo verificar la duración real del consumo. Un mecanismo de consenso agrega atestaciones de múltiples participantes verificados para generar puntajes de confianza, con incentivos económicos (staking) que penalizan comportamientos maliciosos. La distribución de regalías se ejecuta automáticamente mediante contratos inteligentes cuando las reproducciones superan el umbral de verificación. Esta invención es aplicable a la verificación de reproducciones musicales, visualizaciones de video, consumo de podcasts, asistencia a eventos virtuales y experiencias turísticas.

**English:**

The present invention describes a method and system for decentralized verification of digital media consumption using social identity attestation. The system employs decentralized social identifiers (Farcaster FIDs) as a Sybil-resistance mechanism, where user reputation is derived from account age, social connections, and behavioral history. A two-phase cryptographic commit-reveal scheme is implemented to prevent manipulation of consumption data: users generate a cryptographic hash when starting playback and reveal the original data upon completion, allowing verification of actual consumption duration. A consensus mechanism aggregates attestations from multiple verified participants to generate confidence scores, with economic incentives (staking) that penalize malicious behavior. Royalty distribution is automatically executed through smart contracts when plays exceed the verification threshold. This invention is applicable to verification of music plays, video views, podcast consumption, virtual event attendance, and tourism experiences.

---

## IX. DECLARACIÓN DE NOVEDAD / NOVELTY STATEMENT

El solicitante declara que, tras una búsqueda diligente del estado del arte, no se ha encontrado ninguna publicación, patente o aplicación de patente previa que describa:

1. El uso de grafos sociales descentralizados (específicamente Farcaster) como mecanismo de resistencia Sybil para verificación de consumo de medios

2. La combinación de esquemas de compromiso-revelación con identidad social para verificar reproducciones de contenido digital

3. Un protocolo de consenso descentralizado específicamente diseñado para atestación de experiencias de consumo de medios

4. La distribución automática de regalías basada en verificación de consumo mediante el método descrito

---

## X. DOCUMENTOS CITADOS / CITED DOCUMENTS

1. Nakamoto, S. (2008). "Bitcoin: A Peer-to-Peer Electronic Cash System"
2. Buterin, V. (2014). "Ethereum White Paper"
3. Chainlink Labs. (2017). "Chainlink: A Decentralized Oracle Network"
4. Pyth Network. (2021). "Pyth Network: A High-Fidelity Oracle Network"
5. Farcaster Protocol. (2022). "Farcaster: A Sufficiently Decentralized Social Network"
6. Worldcoin Foundation. (2023). "Worldcoin: A Global Identity and Financial Network"

---

## XI. INFORMACIÓN ADICIONAL PARA IMPI

### 11.1 Clasificación Internacional de Patentes (CIP)
- G06Q 20/00 - Arquitecturas, esquemas o protocolos de pago
- G06F 21/00 - Disposiciones de seguridad para proteger computadoras
- H04L 9/32 - Disposiciones de seguridad basadas en criptografía
- G06Q 50/00 - Sistemas o métodos especialmente adaptados para sectores específicos

### 11.2 Documentación Complementaria Requerida
- [ ] Poder notarial (si aplica representante legal)
- [ ] Comprobante de pago de tasas
- [ ] Cesión de derechos del inventor al solicitante (si difieren)
- [ ] Documento de prioridad (si reclama prioridad de otra solicitud)

### 11.3 Tasas Aplicables (2024-2025)
- Solicitud de patente: ~$8,500 MXN
- Examen de fondo: ~$10,500 MXN
- Expedición del título: ~$4,000 MXN

---

## XII. DECLARACIÓN DEL INVENTOR

Yo, [NOMBRE COMPLETO], declaro bajo protesta de decir verdad que soy el inventor original de la invención descrita en esta solicitud y que la información proporcionada es verdadera y correcta según mi mejor conocimiento.

Firma: _______________________

Fecha: _______________________

Lugar: Villa Guerrero, Estado de México, México

---

**FIN DEL DOCUMENTO DE SOLICITUD DE PATENTE**

---

*Este documento ha sido preparado siguiendo los lineamientos del Instituto Mexicano de la Propiedad Industrial (IMPI) y la Ley Federal de Protección a la Propiedad Industrial (LFPPI).*

*Referencias: [IMPI Official Portal](https://www.gob.mx/impi), [Patent Filing Guide](https://www.patentarea.com/patent-filing-in-mexico-guide/), [Mexico Patent Laws 2025](https://iclg.com/practice-areas/patents-laws-and-regulations/mexico)*
