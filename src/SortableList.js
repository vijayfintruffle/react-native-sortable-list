import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {ScrollView, View, StyleSheet, Platform, RefreshControl, Text} from 'react-native';
import {shallowEqual, swapArrayElements} from './utils';
import Row from './Row';

const AUTOSCROLL_INTERVAL = 100;
const ZINDEX = Platform.OS === 'ios' ? 'zIndex' : 'elevation';


// react-native seems to sometimes represent stylesheet entries as numbers, and sometimes as objects.
// See: https://stackoverflow.com/questions/41483862/how-are-styles-mapped-to-numbers-in-react-native
const STYLE_TYPE = PropTypes.oneOfType([PropTypes.number, PropTypes.object])

export default class SortableList extends Component {
  static propTypes = {
    data: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
    order: PropTypes.arrayOf(PropTypes.any),
    style: STYLE_TYPE,
    contentContainerStyle: STYLE_TYPE,
    innerContainerStyle: STYLE_TYPE,
    sortingEnabled: PropTypes.bool,
    scrollEnabled: PropTypes.bool,
    horizontal: PropTypes.bool,
    showsVerticalScrollIndicator: PropTypes.bool,
    showsHorizontalScrollIndicator: PropTypes.bool,
    refreshControl: PropTypes.element,
    autoscrollAreaSize: PropTypes.number,
    snapToAlignment: PropTypes.string,
    rowActivationTime: PropTypes.number,
    manuallyActivateRows: PropTypes.bool,
    keyboardShouldPersistTaps: PropTypes.oneOf(['never', 'always', 'handled']),
    scrollEventThrottle: PropTypes.number,
    decelerationRate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    pagingEnabled: PropTypes.bool,
    nestedScrollEnabled: PropTypes.bool,
    disableIntervalMomentum: PropTypes.bool,
    renderHeader: PropTypes.func.isRequired,
    renderRow: PropTypes.func.isRequired,

    onChangeOrder: PropTypes.func,
    onActivateRow: PropTypes.func,
    onReleaseRow: PropTypes.func,
    onScroll: PropTypes.func,
  };

  static defaultProps = {
    sortingEnabled: true,
    scrollEnabled: true,
    keyboardShouldPersistTaps: 'never',
    autoscrollAreaSize: 60,
    snapToAlignment: 'start',
    manuallyActivateRows: false,
    showsVerticalScrollIndicator: true,
    showsHorizontalScrollIndicator: true,
    scrollEventThrottle: 2,
    decelerationRate: 'normal',
    pagingEnabled: false,
    onScroll: () => {}
  }

  /**
   * Stores refs to rows’ components by keys.
   */
  _rows = {};
   // Stores promises of rows’ layouts.
  _rowsLayouts = {};
  _resolveRowLayout = {};

  _contentOffset = {x: 0, y: 0};

  _catMap = {};
  _itemMap = {};
  populateKeys(data) {
    let order = [];
    data.map((obj) => {
      this._catMap["FT-C-"+obj.id] = obj;
      order.push("FT-C-"+obj.id);
      obj.items.map((item) => {
        order.push(item.id+"");
        this._itemMap[item.id] = item;
      })
    });

    return order;
  }

  state = {
    animated: false,
    order: this.props.order || this.populateKeys(this.props.data),
    rowsLayouts: null,
    containerLayout: null,
    data: this.props.data,
    isMounting: true,
    activeRowKey: null,
    activeRowIndex: null,
    releasedRowKey: null,
    sortingEnabled: this.props.sortingEnabled,
    scrollEnabled: this.props.scrollEnabled
  };

  componentDidMount() {
    this.state.order.forEach((key) => {
      this._rowsLayouts[key] = new Promise((resolve) => {
        this._resolveRowLayout[key] = resolve;
      });
    });
    this._onUpdateLayouts();
    this.setState({ isMounting: false });
  }

  scrollBy({dx = 0, dy = 0, animated = false}) {
    if (this.props.horizontal) {
      this._contentOffset.x += dx;
    } else {
      this._contentOffset.y += dy;
    }

    this._scroll(animated);
  }

  render() {
    if (this.state.isMounting ) return null;

    let {
      contentContainerStyle,
      innerContainerStyle,
      horizontal,
      style,
      showsVerticalScrollIndicator,
      showsHorizontalScrollIndicator,
      snapToAlignment,
      scrollEventThrottle,
      decelerationRate,
      pagingEnabled,
      nestedScrollEnabled,
      disableIntervalMomentum,
      keyboardShouldPersistTaps,
    } = this.props;
    const {animated, contentHeight, contentWidth, scrollEnabled} = this.state;
    const containerStyle = StyleSheet.flatten([style, {opacity: Number(animated)}])
    innerContainerStyle = [
      styles.rowsContainer,
      horizontal ? {width: contentWidth} : {height: contentHeight},
      innerContainerStyle
    ];
    let {refreshControl} = this.props;
    if (refreshControl && refreshControl.type === RefreshControl) {
      refreshControl = React.cloneElement(this.props.refreshControl, {
        enabled: scrollEnabled, // fix for Android
      });
    }
    return (
      <View style={containerStyle} ref={this._onRefContainer}>
        <ScrollView
          nestedScrollEnabled={nestedScrollEnabled}
          disableIntervalMomentum={disableIntervalMomentum}
          refreshControl={refreshControl}
          ref={this._onRefScrollView}
          horizontal={horizontal}
          contentContainerStyle={contentContainerStyle}
          scrollEventThrottle={scrollEventThrottle}
          pagingEnabled={pagingEnabled}
          decelerationRate={decelerationRate}
          scrollEnabled={scrollEnabled}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          snapToAlignment={snapToAlignment}
          onScroll={this._onScroll}
        >
          <View style={innerContainerStyle}>
            {this._renderRows()}
          </View>
        </ScrollView>
      </View>
    );
  }

  //testKey = 0;

  _renderRows() {
    const {horizontal, rowActivationTime, sortingEnabled, renderRow, renderHeader} = this.props;
    const {animated, order, data, activeRowKey, releasedRowKey, rowsLayouts} = this.state;

    
    let nextX = 0;
    let nextY = 0;

    return order.map((key, index) => {      
      const style = {[ZINDEX]: 0};
      const location = {x: 0, y: 0};
      if (rowsLayouts) {
        if (horizontal) {
          location.x = nextX;
          nextX += rowsLayouts[key] ? rowsLayouts[key].width : 0;
        } else {
          location.y = nextY;
          nextY += rowsLayouts[key] ? rowsLayouts[key].height : 0;
        }
      }

      const active = activeRowKey === key;
      const released = releasedRowKey === key;

      if (active || released) {
        style[ZINDEX] = 100;
      }
      if(key.startsWith("FT-C-")) {
        return (<Row
            key={key}
            ref={this._onRefRow.bind(this, key)}
            horizontal={horizontal}
            activationTime={rowActivationTime}
            animated={animated && !active}
            disabled={sortingEnabled}
            style={style}
            location={location}
            onLayout={!rowsLayouts ? this._onLayoutRow.bind(this, key) : null}
            onActivate={this._onActivateRow.bind(this, key, index)}
            onPress={this._onPressRow.bind(this, key)}
            onRelease={this._onReleaseRow.bind(this, key)}
            onMove={this._onMoveRow}
            manuallyActivateRows={this.props.manuallyActivateRows}>
            {renderHeader({
              key: this._catMap[key].key,
              data: this._catMap[key],
              disabled: sortingEnabled,
              active,
              index,
            })}
          </Row>
        )
      } else {
        return (
          <Row
            key={key}
            ref={this._onRefRow.bind(this, key)}
            horizontal={horizontal}
            activationTime={rowActivationTime}
            animated={animated && !active}
            disabled={!sortingEnabled}
            style={style}
            location={location}
            onLayout={!rowsLayouts ? this._onLayoutRow.bind(this, key) : null}
            onActivate={this._onActivateRow.bind(this, key, index)}
            onPress={this._onPressRow.bind(this, key)}
            onRelease={this._onReleaseRow.bind(this, key)}
            onMove={this._onMoveRow}
            manuallyActivateRows={this.props.manuallyActivateRows}>
            {renderRow({
              key,
              data: this._itemMap[key],
              disabled: !sortingEnabled,
              active,
              index,
              parent:this._itemMap[key].parent,
            })}
          </Row>
      );
      }

      

    });
    

   
  }

  _onUpdateLayouts() {
    Promise.all([...Object.values(this._rowsLayouts)])
      .then(([...rowsLayouts]) => {
        // Can get correct container’s layout only after rows’s layouts.
        this._container.measure((x, y, width, height, pageX, pageY) => {
          const rowsLayoutsByKey = {};
          let contentHeight = 0;
          let contentWidth = 0;


          rowsLayouts.forEach(({rowKey, layout}) => {
            rowsLayoutsByKey[rowKey] = layout;
            contentHeight += layout.height;
            contentWidth += layout.width;
          });

          this.setState({
            containerLayout: {x, y, width, height, pageX, pageY},
            rowsLayouts: rowsLayoutsByKey,
            contentHeight,
            contentWidth,
          }, () => {
            this.setState({animated: true});
          });
        });
      });
  }

  _scroll(animated) {
    this._scrollView.scrollTo({...this._contentOffset, animated});
  }

  /**
   * Finds a row under the moving row, if they are neighbours,
   * swaps them, else shifts rows.
   */
  _setOrderOnMove() {
    const {activeRowKey, activeRowIndex, order} = this.state;

    if (activeRowKey === null || this._autoScrollInterval) {
      return;
    }

    let {
      rowKey: rowUnderActiveKey,
      rowIndex: rowUnderActiveIndex,
    } = this._findRowUnderActiveRow();

    if (this._movingDirectionChanged) {
      this._prevSwapedRowKey = null;
    }
    // Swap rows if necessary.
    if (rowUnderActiveKey !== activeRowKey && rowUnderActiveKey !== this._prevSwapedRowKey) {
      const isNeighbours = Math.abs(rowUnderActiveIndex - activeRowIndex) === 1;
      let nextOrder;

      // If they are neighbours, swap elements, else shift.
      if (isNeighbours && rowUnderActiveIndex !== 0) {
        this._prevSwapedRowKey = rowUnderActiveKey;
        nextOrder = swapArrayElements(order, activeRowIndex, rowUnderActiveIndex);
      } else if(rowUnderActiveIndex !== 0){
        nextOrder = order.slice();
        nextOrder.splice(activeRowIndex, 1);
        nextOrder.splice(rowUnderActiveIndex, 0, activeRowKey);
      } else {
        nextOrder = order;
      }
      if(!nextOrder[0].startsWith("FT-C-")) {
        tmp = nextOrder[0];
        nextOrder[0] = nextOrder[1];
        nextOrder[1] = tmp;
      }

      this.setState({
        order: nextOrder,
        activeRowIndex: rowUnderActiveIndex,
      }, () => {
        if (this.props.onChangeOrder) {
          this.props.onChangeOrder(nextOrder);
        }
      });
    }
  }

  /**
   * Finds a row, which was covered with the moving row’s half.
   */
  _findRowUnderActiveRow() {
    const {horizontal} = this.props;
    const {rowsLayouts, activeRowKey, activeRowIndex, order} = this.state;
    const movingRowLayout = rowsLayouts[activeRowKey];
    const rowLeftX = this._activeRowLocation.x
    const rowRightX = rowLeftX + movingRowLayout.width;
    const rowTopY = this._activeRowLocation.y;
    const rowBottomY = rowTopY + movingRowLayout.height;

    for (
      let currentRowIndex = 0, x = 0, y = 0,a =0, rowsCount = order.length;
      currentRowIndex < rowsCount - 1;
      currentRowIndex++, a++
    ) {
      const currentRowKey = order[currentRowIndex];
      const currentRowLayout = rowsLayouts[currentRowKey];
      const nextRowIndex = currentRowIndex + 1;
      const nextRowLayout = rowsLayouts[order[nextRowIndex]];

      x += currentRowLayout.width;
      y += currentRowLayout.height;

      if (currentRowKey !== activeRowKey && currentRowIndex !==0 && (
        horizontal
          ? ((x - currentRowLayout.width <= rowLeftX || currentRowIndex === 0) && rowLeftX <= x - currentRowLayout.width / 3)
          : ((y - currentRowLayout.height <= rowTopY || currentRowIndex === 0) && rowTopY <= y - currentRowLayout.height / 3)
      )) {
        return {
          rowKey: order[currentRowIndex],
          rowIndex: currentRowIndex,
        };
      }

      if (horizontal
        ? (x + nextRowLayout.width / 3 <= rowRightX && (rowRightX <= x + nextRowLayout.width || nextRowIndex === rowsCount - 1))
        : (y + nextRowLayout.height / 3 <= rowBottomY && (rowBottomY <= y + nextRowLayout.height || nextRowIndex === rowsCount - 1))
      ) {
        return {
          rowKey: order[nextRowIndex],
          rowIndex: nextRowIndex,
        };
      }
    }
    return {rowKey: activeRowKey, rowIndex: activeRowIndex};
  }

  _scrollOnMove(e) {
    const {pageX, pageY} = e.nativeEvent;
    const {horizontal} = this.props;
    const {containerLayout} = this.state;
    let inAutoScrollBeginArea = false;
    let inAutoScrollEndArea = false;

    if (horizontal) {
      inAutoScrollBeginArea = pageX < containerLayout.pageX + this.props.autoscrollAreaSize;
      inAutoScrollEndArea = pageX > containerLayout.pageX + containerLayout.width - this.props.autoscrollAreaSize;
    } else {
      inAutoScrollBeginArea = pageY < containerLayout.pageY + this.props.autoscrollAreaSize;
      inAutoScrollEndArea = pageY > containerLayout.pageY + containerLayout.height - this.props.autoscrollAreaSize;
    }

    if (!inAutoScrollBeginArea &&
      !inAutoScrollEndArea &&
      this._autoScrollInterval !== null
    ) {
      this._stopAutoScroll();
    }

    // It should scroll and scrolling is processing.
    if (this._autoScrollInterval !== null) {
      return;
    }

    if (inAutoScrollBeginArea) {
      this._startAutoScroll({
        direction: -1,
        shouldScroll: () => this._contentOffset[horizontal ? 'x' : 'y'] > 0,
        getScrollStep: (stepIndex) => {
          const nextStep = this._getScrollStep(stepIndex);
          const contentOffset = this._contentOffset[horizontal ? 'x' : 'y'];

          return contentOffset - nextStep < 0 ? contentOffset : nextStep;
        },
      });
    } else if (inAutoScrollEndArea) {
      this._startAutoScroll({
        direction: 1,
        shouldScroll: () => {
          const {
            contentHeight,
            contentWidth,
            containerLayout,
            footerLayout = {height: 0},
          } = this.state;

          if (horizontal) {
            return this._contentOffset.x < contentWidth - containerLayout.width
          } else {
            return this._contentOffset.y < contentHeight + footerLayout.height - containerLayout.height;
          }
        },
        getScrollStep: (stepIndex) => {
          const nextStep = this._getScrollStep(stepIndex);
          const {
            contentHeight,
            contentWidth,
            containerLayout,
            footerLayout = {height: 0},
          } = this.state;

          if (horizontal) {
            return this._contentOffset.x + nextStep > contentWidth - containerLayout.width
              ? contentWidth - containerLayout.width - this._contentOffset.x
              : nextStep;
          } else {
            const scrollHeight = contentHeight + footerLayout.height - containerLayout.height;

            return this._contentOffset.y + nextStep > scrollHeight
              ? scrollHeight - this._contentOffset.y
              : nextStep;
          }
        },
      });
    }
  }

  _getScrollStep(stepIndex) {
    return stepIndex > 3 ? 60 : 30;
  }

  _startAutoScroll({direction, shouldScroll, getScrollStep}) {
    if (!shouldScroll()) {
      return;
    }

    const {activeRowKey} = this.state;
    const {horizontal} = this.props;
    let counter = 0;

    this._autoScrollInterval = setInterval(() => {
      if (shouldScroll()) {
        const movement = {
          [horizontal ? 'dx' : 'dy']: direction * getScrollStep(counter++),
        };

        this.scrollBy(movement);
        this._rows[activeRowKey].moveBy(movement);
      } else {
        this._stopAutoScroll();
      }
    }, AUTOSCROLL_INTERVAL);
  }

  _stopAutoScroll() {
    clearInterval(this._autoScrollInterval);
    this._autoScrollInterval = null;
  }

  _onLayoutRow(rowKey, {nativeEvent: {layout}}) {
    this._resolveRowLayout[rowKey]({rowKey, layout});
  }

  _onActivateRow = (rowKey, index, e, gestureState, location) => {
    this._activeRowLocation = location;

    this.setState({
      activeRowKey: rowKey,
      activeRowIndex: index,
      releasedRowKey: null,
      scrollEnabled: false,
    });

    if (this.props.onActivateRow) {
      this.props.onActivateRow(rowKey);
    }
  };

  _onPressRow = (rowKey) => {
    if (this.props.onPressRow) {
      this.props.onPressRow(rowKey);
    }
  };

  _onReleaseRow = (rowKey) => {
    this._stopAutoScroll();
    this.setState(({activeRowKey}) => ({
      activeRowKey: null,
      activeRowIndex: null,
      releasedRowKey: activeRowKey,
      scrollEnabled: this.props.scrollEnabled,
    }));
    let modifiedData = [];
    let category;
    let items = []
    this.state.order.map((key) => {
      if(key.startsWith("FT-C-")) {
        if(category !== undefined) {
          category["items"] = items;
          modifiedData.push(category);
        }
        category = {};
        items = []
        sourceCategory = this._catMap[key];
        category["title"] = sourceCategory["title"];
        category["id"] = sourceCategory["id"];
      } else {
        items.push(this._itemMap[key]);
      }

    });
    category["items"] = items;
      modifiedData.push(category);

    if (this.props.onReleaseRow) {
      this.props.onReleaseRow(modifiedData);
    }
  };

  _onMoveRow = (e, gestureState, location) => {
    const prevMovingRowX = this._activeRowLocation.x;
    const prevMovingRowY = this._activeRowLocation.y;
    const prevMovingDirection = this._movingDirection;

    this._activeRowLocation = location;
    this._movingDirection = this.props.horizontal
      ? prevMovingRowX < this._activeRowLocation.x
      : prevMovingRowY < this._activeRowLocation.y;

    this._movingDirectionChanged = prevMovingDirection !== this._movingDirection;
    this._setOrderOnMove();

    if (this.props.scrollEnabled) {
      this._scrollOnMove(e);
    }
  };

  _onScroll = (e) => {
      this._contentOffset = e.nativeEvent.contentOffset;
      this.props.onScroll(e)
  };

  _onRefContainer = (component) => {
    this._container = component;
  };

  _onRefScrollView = (component) => {
    this._scrollView = component;
  };

  _onRefRow = (rowKey, component) => {
    this._rows[rowKey] = component;
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  rowsContainer: {
    flex: 1,
    zIndex: 1,
  },
});
