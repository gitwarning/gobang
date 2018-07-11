import scorePoint from "./evaluate-point.js"
import zobrist from "./zobrist.js"
import R from "./role.js"
import S from "./score.js"
import config from "./config.js"
import array from "./arrary.js"
import statistic from './statistic.js'
import math from './math.js'

var count = 0
var total = 0

//冲四的分其实肯定比活三高，但是如果这样的话容易形成盲目冲四的问题，所以如果发现电脑有无意义的冲四，则将分数降低到和活三一样
//而对于冲四活三这种杀棋，则将分数提高。
var fixScore = function(type) {
  if(type < S.FOUR && type >= S.BLOCKED_FOUR) {

    if(type >= S.BLOCKED_FOUR && type < (S.BLOCKED_FOUR + S.THREE)) {
      //单独冲四，意义不大
      return S.THREE
    } else if(type >= S.BLOCKED_FOUR + S.THREE && type < S.BLOCKED_FOUR * 2) {
      return S.FOUR  //冲四活三，比双三分高，相当于自己形成活四
    } else {
      //双冲四 比活四分数也高
      return S.FOUR * 2
    }
  }
  return type
}

var starTo = function (a, b) {
  // 距离必须在5步以内
  if ((Math.abs(a[0]-b[0]) > 4 || Math.abs(a[1]-b[1]) > 4)) return false
  // 必须在米子方向上
  return a[0] === b[0] || a[1] === b[1] || (Math.abs(a[0]-b[0]) === Math.abs(a[1]-b[1]))
}

class Board {

  init (sizeOrBoard) {
    this.evaluateCache = {}
    this.steps = []
    this.allSteps = []
    this.stepsTail = []
    this.zobrist = zobrist
    zobrist.init() // 注意重新初始化
    this._last = [false, false] // 记录最后一步
    var size
    if(sizeOrBoard.length) {
      this.board = sizeOrBoard
      size = this.board.length
    } else {
      size = sizeOrBoard
      this.board = []
      for(var i=0;i<size;i++) {
        var row = []
        for(var j=0;j<size;j++) {
          row.push(0)
        }
        this.board.push(row)
      }
    }
    statistic.init(size)


    // 存储双方得分
    this.comScore = array.create(size, size)
    this.humScore = array.create(size, size)

    // scoreCache[role][dir][row][column]
    this.scoreCache = [
      [], // placeholder
      [ // for role 1
        array.create(size, size),
        array.create(size, size),
        array.create(size, size),
        array.create(size, size)
      ],
      [ // for role 2
        array.create(size, size),
        array.create(size, size),
        array.create(size, size),
        array.create(size, size)
      ]
    ]

    this.initScore()
    
  }

  initScore () {

    var board = this.board

    for(var i=0;i<board.length;i++) {
      for(var j=0;j<board[i].length;j++) {
        // 空位，对双方都打分
        if(board[i][j] == R.empty) {
          if(this.hasNeighbor([i, j], 2, 2)) { //必须是有邻居的才行
            var cs = scorePoint(this, [i, j], R.com)
            var hs = scorePoint(this, [i, j], R.hum)
            this.comScore[i][j] = cs
            this.humScore[i][j] = hs
          }

        } else if (board[i][j] == R.com) { // 对电脑打分，玩家此位置分数为0
          this.comScore[i][j] = scorePoint(this, [i, j], R.com)
          this.humScore[i][j] = 0
        } else if (board[i][j] == R.hum) { // 对玩家打分，电脑位置分数为0
          this.humScore[i][j] = scorePoint(this, [i, j], R.hum)
          this.comScore[i][j] = 0
        }
      }
    }
  }

  //只更新一个点附近的分数
  // 参见 evaluate point 中的代码，为了优化性能，在更新分数的时候可以指定只更新某一个方向的分数
  updateScore (p) {
    var radius = 6,
        board = this.board,
        self = this,
        len = this.board.length

    function update(x, y, dir) {
      var role = self.board[x][y]
      if (role !== R.reverse(R.com)) {
        var cs = scorePoint(self, [x, y], R.com, dir)
        self.comScore[x][y] = cs
        statistic.table[x][y] += cs
      } else self.comScore[x][y] = 0
      if (role !== R.reverse(R.hum)) {
        var hs = scorePoint(self, [x, y], R.hum, dir)
        self.humScore[x][y] = hs
        statistic.table[x][y] += hs
      } else self.humScore[x][y] = 0

    }
    // 无论是不是空位 都需要更新
    // -
    for(var i=-radius;i<radius;i++) {
      var x = p[0], y = p[1]+i
      if(y<0) continue
      if(y>=len) break
      update(x, y, 0)
    }

    // |
    for(var i=-radius;i<radius;i++) {
      var x = p[0]+i, y = p[1]
      if(x<0) continue
      if(x>=len) break
      update(x, y, 1)
    }

    // \
    for(var i=-radius;i<radius;i++) {
      var x = p[0]+i, y = p[1]+i
      if(x<0 || y<0) continue
      if(x>=len || y>=len) break
      update(x, y, 2)
    }

    // /
    for(var i=-radius;i<radius;i++) {
      var x = p[0]+i, y = p[1]-i
      if(x<0 || y<0) continue
      if(x>=len || y>=len) continue
      update(x, y, 3)
    }


  }

  //下子
  put (p, role, record) {
    p.role = role
    config.debug && console.log('put [' + p + ']' + ' ' + role)
    this.board[p[0]][p[1]] = role
    this.zobrist.go(p[0], p[1], role)
    if (record) this.steps.push(p)
    this.updateScore(p)
    this.allSteps.push(p)
    this.stepsTail = []
  }
  // 最后一次下子位置
  last (role) {
    for(var i=this.allSteps.length-1;i>=0;i--) {
      var p = this.allSteps[i]
      if(this.board[p[0]][p[1]] === role) return p
    }
    return false
  }

  //移除棋子
  remove (p) {
    var r = this.board[p[0]][p[1]]
    config.debug && console.log('remove [' + p + ']' + ' ' + r)
    this.zobrist.go(p[0], p[1], r)
    this.board[p[0]][p[1]] = R.empty
    this.updateScore(p)
    this.allSteps.pop()
  }

  //悔棋
  backward () {
    if(this.steps.length < 2) return
    var i =0;
    while(i<2) {
      var s = this.steps.pop()
      this.zobrist.go(s[0], s[1], this.board[s[0]][s[1]])
      this.board[s[0]][s[1]] = R.empty
      this.updateScore(s)
      this.allSteps.pop()

      this.stepsTail.push(s)
      i++
    }
  }

  //前进
  forward () {
    if(this.stepsTail.length < 2) return
    var i =0;
    while(i<2) {
      var s = this.stepsTail.pop()
      this.zobrist.go(s[0], s[1], this.board[s[0]][s[1]])
      this.board[s[0]][s[1]] = s.role
      this.updateScore(s)
      this.steps.push(s)
      this.allSteps.push(s)
      i++
    }
  }


  logSteps () {
    console.log("steps:" + this.allSteps.map((d) => '['+d[0]+','+d[1]+']').join(','))
  }

  //棋面估分
  //这里只算当前分，而不是在空位下一步之后的分
  evaluate (role) {

    //这里加了缓存，但是并没有提升速度
    // if(config.cache && this.evaluateCache[this.zobrist.code]) return this.evaluateCache[this.zobrist.code]

    // 这里都是用正整数初始化的，所以初始值是0
    this.comMaxScore = 0
    this.humMaxScore = 0

    var board = this.board

    //遍历出最高分，开销不大
    for(var i=0;i<board.length;i++) {
      for(var j=0;j<board[i].length;j++) {
        if(board[i][j] == R.com) {
          this.comMaxScore += fixScore(this.comScore[i][j])
        } else if (board[i][j] == R.hum) {
          this.humMaxScore += fixScore(this.humScore[i][j])
        }
      }
    }
    // 有冲四延伸了，不需要专门处理冲四活三
    // 不过这里做了这一步，可以减少电脑胡乱冲四的毛病
    //this.comMaxScore = fixScore(this.comMaxScore)
    //this.humMaxScore = fixScore(this.humMaxScore)
    var result = (role == R.com ? 1 : -1) * (this.comMaxScore - this.humMaxScore)
    // if (config.cache) this.evaluateCache[this.zobrist.code] = result

    return result

  }

  //启发函数
  /*
   * 变量starBread的用途是用来进行米子计算
   * 所谓米子计算，只是，如果第一步尝试了一个位置A，那么接下来尝试的位置有两种情况：
   * 1: 大于等于活三的位置
   * 2: 在A的米子位置上
   * 注意只有对小于活三的棋才进行starSpread优化
   */

  /*
   * gen 函数的排序是非常重要的，因为好的排序能极大提升AB剪枝的效率。
   * 而对结果的排序，是要根据role来的
   */


  log () {
    console.log('star: ' + (count/total*100).toFixed(2) + '%, ' + count + '/' + total)
  }
  gen (role, onlyThrees, starSpread) {
    if (this.allSteps.length === 0) return [[7, 7]]
    var fives = []
    var comfours=[]
    var humfours=[]
    var comblockedfours = []
    var humblockedfours = []
    var comtwothrees=[]
    var humtwothrees=[]
    var comthrees = []
    var humthrees = []
    var comtwos = []
    var humtwos = []
    var neighbors = []

    var board = this.board
    // 找到双方的最后进攻点
    var lastPoint1 = undefined, lastPoint2 = undefined


    // 默认情况下 我们遍历整个棋盘。但是在开启star模式下，我们遍历的范围就会小很多
    // 只需要遍历以两个点为中心正方形。
    // 注意除非专门处理重叠区域，否则不要把两个正方形分开算，因为一般情况下这两个正方形会有相当大的重叠面积，别重复计算了
    if (starSpread && config.star) {

      var i = this.allSteps.length - 1
      while(!lastPoint1 && i >= 0) {
        var p = this.allSteps[i]
        if (p.role !== role && p.attack !== role) lastPoint1 = p
        i -= 2
      }

      if (!lastPoint1) {
        lastPoint1 = this.allSteps[0].role !== role ? this.allSteps[0] : this.allSteps[1]
      }

      var i = this.allSteps.length - 2
      while(!lastPoint2 && i >= 0) {
        var p = this.allSteps[i]
        if (p.attack === role) lastPoint2 = p
        i -= 2
      }

      if (!lastPoint2) {
        lastPoint2 = this.allSteps[0].role === role ? this.allSteps[0] : this.allSteps[1]
      }
    }

    for(var i=0;i<board.length;i++) {
      for(var j=0;j<board.length;j++) {
        var p = [i, j]
        if(board[i][j] == R.empty) {
          var neighbor = [2,2]
          if(this.steps.length < 6) neighbor = [1, 1]
          if(this.hasNeighbor([i, j], neighbor[0], neighbor[1])) { //必须是有邻居的才行

            var scoreHum = p.scoreHum = this.humScore[i][j]
            var scoreCom = p.scoreCom = this.comScore[i][j]
            var maxScore = Math.max(scoreCom, scoreHum)
            p.score = maxScore
            p.role = role

            // 标记当前点是为了进攻还是为了防守，后面会用到
              if (scoreCom >= scoreHum) p.attack = R.com // 进攻点
              else p.attack = R.hum // 防守点

            total ++
            /* 双星延伸，以提升性能
             * 思路：每次下的子，只可能是自己进攻，或者防守对面（也就是对面进攻点）
             * 我们假定任何时候，绝大多数情况下进攻的路线都可以按次序连城一条折线，那么每次每一个子，一定都是在上一个己方棋子的八个方向之一。
             * 因为既可能自己进攻，也可能防守对面，所以是最后两个子的米子方向上
             * 那么极少数情况，进攻路线无法连成一条折线呢?很简单，我们对前双方两步不作star限制就好，这样可以 兼容一条折线中间伸出一段的情况
             */
            if (starSpread && config.star) {

              // 距离必须在5步以内
              if (maxScore >= S.FIVE || starTo(p, lastPoint1) || starTo(p, lastPoint2)) {
              } else {
                count ++
                continue
              }
            }

            if(scoreCom >= S.FIVE) {//先看电脑能不能连成5
              fives.push(p)
            } else if(scoreHum >= S.FIVE) {//再看玩家能不能连成5
              //别急着返回，因为遍历还没完成，说不定电脑自己能成五。
              fives.push(p)
            } else if(scoreCom >= S.FOUR) {
              comfours.push(p)
            } else if(scoreHum >= S.FOUR) {
              humfours.push(p)
            } else if(scoreCom >= S.BLOCKED_FOUR) {
              comblockedfours.push(p)
            } else if(scoreHum >= S.BLOCKED_FOUR) {
              humblockedfours.push(p)
            } else if(scoreCom >= 2*S.THREE) {
              //能成双三也行
              comtwothrees.push(p)
            } else if(scoreHum >= 2*S.THREE) {
              humtwothrees.push(p)
            } else if(scoreCom >= S.THREE) {
              comthrees.push(p)
            } else if(scoreHum >= S.THREE) {
              humthrees.push(p)
            } else if(scoreCom >= S.TWO) {
              comtwos.unshift(p)
            } else if(scoreHum >= S.TWO) {
              humtwos.unshift(p)
            } else {
              neighbors.push(p)
            }
          }
        }
      }
    }

    //如果成五，是必杀棋，直接返回
    if(fives.length) return fives
    
    // 自己能活四，则直接活四，不考虑冲四
    if (role === R.com && comfours.length) return comfours
    if (role === R.hum && humfours.length) return humfours

    // 对面有活四冲四，自己冲四都没，则只考虑对面活四 （此时对面冲四就不用考虑了)
    
    if (role === R.com && humfours.length && !comblockedfours.length) return humfours
    if (role === R.hum && comfours.length && !humblockedfours.length) return comfours

    // 对面有活四自己有冲四，则都考虑下
    var fours = role === R.com ? comfours.concat(humfours) : humfours.concat(comfours)
    var blockedfours = role === R.com ? comblockedfours.concat(humblockedfours) : humblockedfours.concat(comblockedfours)
    if (fours.length) return fours.concat(blockedfours)

    var result = []
    if (role === R.com) {
      result = 
        comtwothrees
        .concat(humtwothrees)
        .concat(comblockedfours)
        .concat(humblockedfours)
        .concat(comthrees)
        .concat(humthrees)
    }
    if (role === R.hum) {
      result = 
        humtwothrees
        .concat(comtwothrees)
        .concat(humblockedfours)
        .concat(comblockedfours)
        .concat(humthrees)
        .concat(comthrees)
    }

    // result.sort(function(a, b) { return b.score - a.score })

    //双三很特殊，因为能形成双三的不一定比一个活三强
    if(comtwothrees.length || humtwothrees.length) {
      return result
    }


    // 只返回大于等于活三的棋
    if (onlyThrees) {
      return result
    }


    var twos
    if (role === R.com) twos = comtwos.concat(humtwos)
    else twos = humtwos.concat(comtwos)

    twos.sort(function(a, b) { return b.score - a.score })
    result = result.concat(twos.length ? twos : neighbors)

    //这种分数低的，就不用全部计算了
    if(result.length>config.countLimit) {
      return result.slice(0, config.countLimit)
    }

    return result
  }

  hasNeighbor (point, distance, count) {
    var board = this.board
    var len = board.length
    var startX = point[0]-distance
    var endX = point[0]+distance
    var startY = point[1]-distance
    var endY = point[1]+distance
    for(var i=startX;i<=endX;i++) {
      if(i<0||i>=len) continue
      for(var j=startY;j<=endY;j++) {
        if(j<0||j>=len) continue
        if(i==point[0] && j==point[1]) continue
        if(board[i][j] != R.empty) {
          count --
          if(count <= 0) return true
        }
      }
    }
    return false
  }

  toString () {
    return this.board.map(function (d) { return d.join(',') }).join('\n')
  }
}

var board = new Board()

export default board